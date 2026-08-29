// app/api/pipeline/run/route.js
// Déclenché par le bouton du dashboard — exécute tout le pipeline en une
// fois pour TOUS les événements bancaires du jour, sans attendre les crons.
//
// FIX 1 : utilise scraperBanqueCentraleViaRender() au lieu de l'ancien
// chemin cassé /scrape/central-bank-statement.
// FIX 2 : en cas d'erreur, l'entrée CentralBankPipeline est fermée
// proprement au lieu de rester bloquée en "pending" indéfiniment.
// FIX 4 (28/08) : retrait complet du fallback recupererDernierEventConnu.
// FIX 5 (29/08) : écrit désormais aussi le fichier par devise (comme
// central-bank-scrape/route.js).
//
// FIX 8 (29/08) : chemin R2 renommé de banques-centrales/{devise}.json
// vers database/banque-centrale/{devise}.json, cohérent avec
// database/calendrier-bc/. Voir central-bank-scrape/route.js, modifié
// dans le même commit.

import { NextResponse } from "next/server";
import { lireEvenementsDuJour } from "../../../../lib/reconnaissance-service";
import { DEVISE_TO_BANQUE, trouverCategoriePourEvenement } from "../../../../lib/central-bank-keywords";
import { filtrerParagraphes } from "../../../../lib/paragraph-filter-service";
import {
  enregistrerReconnaissance,
  enregistrerDocumentFinal,
} from "../../../../lib/central-bank-pipeline-service";
import { scraperBanqueCentraleViaRender } from "../../../../lib/central-bank-render-client";
import { ecrireJSONDansR2, lireJSONDepuisR2, genererCleDuJour } from "../../../../lib/r2-client";

export const maxDuration = 60;

function detecterEvenementsBancaires(evenementsDuJour) {
  const detectes = [];
  const dejaVus = new Set();

  for (const e of evenementsDuJour) {
    const categorie = trouverCategoriePourEvenement(e.evenement);
    if (!categorie) continue;
    const banqueCentrale = DEVISE_TO_BANQUE[e.devise] || null;
    if (!banqueCentrale) continue;
    const cleDedup = `${e.devise}-${categorie}`;
    if (dejaVus.has(cleDedup)) continue;
    dejaVus.add(cleDedup);
    detectes.push({ devise: e.devise, banqueCentrale, categorie, evenementNom: e.evenement, heureEvenement: e.heure });
  }
  return detectes;
}

/**
 * Identique à central-bank-scrape/route.js — dupliqué volontairement
 * (petit fichier, pas de dépendance circulaire) pour que les deux
 * routes produisent le même format de sortie sur R2.
 */
async function mettreAJourFichierDevise(devise, entreeDuJour) {
  const cleDevise = `database/banque-centrale/${devise}.json`;

  let historique = [];
  try {
    const existant = await lireJSONDepuisR2(cleDevise);
    historique = existant.historique || [];
  } catch {
    historique = [];
  }

  const dateDuJour = entreeDuJour.date;
  const categorieDuJour = entreeDuJour.categorie;

  const historiqueFiltre = historique.filter(
    (h) => !(h.date === dateDuJour && h.categorie === categorieDuJour)
  );
  historiqueFiltre.push(entreeDuJour);
  historiqueFiltre.sort((a, b) => new Date(a.date) - new Date(b.date));

  await ecrireJSONDansR2(cleDevise, {
    devise,
    updatedAt: new Date().toISOString(),
    count: historiqueFiltre.length,
    historique: historiqueFiltre,
  });

  return cleDevise;
}

/**
 * POST /api/pipeline/run
 *
 * Architecture stricte, deux issues possibles par événement bancaire
 * détecté aujourd'hui via le calendrier BC :
 *   - "ok"   : contenu réel scrapé (statement/minutes/discours/...)
 *   - "skip" : rien de pertinent trouvé — documentFinal vide, jamais de
 *              contenu de substitution venant d'un autre jour/événement.
 *   - "error": échec technique.
 */
export async function POST(request) {
  try {
    const evenementsDuJour = await lireEvenementsDuJour();
    const evenementsBancaires = detecterEvenementsBancaires(evenementsDuJour);

    if (evenementsBancaires.length === 0) {
      await enregistrerReconnaissance({ devise: null, banqueCentrale: null, categorie: null, evenementNom: null, heureEvenement: null, scrapeTarget: false });
      return NextResponse.json({ status: "skip", reason: "aucun événement bancaire aujourd'hui" });
    }

    const resultats = [];
    const dateISOJour = new Date().toISOString().split("T")[0];

    for (const evt of evenementsBancaires) {
      const entree = await enregistrerReconnaissance({
        devise: evt.devise, banqueCentrale: evt.banqueCentrale, categorie: evt.categorie,
        evenementNom: evt.evenementNom, heureEvenement: evt.heureEvenement, scrapeTarget: true,
      });

      try {
        const texte = await scraperBanqueCentraleViaRender(evt.banqueCentrale, evt.categorie);
        const phrases = filtrerParagraphes(texte, evt.banqueCentrale);

        if (phrases.length === 0) {
          await enregistrerDocumentFinal(entree.id, []);
          resultats.push({
            devise: evt.devise,
            banqueCentrale: evt.banqueCentrale,
            categorie: evt.categorie,
            status: "skip",
            reason: "aucun mot-clé trouvé",
            documentFinal: [],
          });

          await mettreAJourFichierDevise(evt.devise, {
            date: dateISOJour,
            banqueCentrale: evt.banqueCentrale,
            categorie: evt.categorie,
            status: "skip",
            documentFinal: [],
          });
          continue;
        }

        const saved = await enregistrerDocumentFinal(entree.id, phrases);
        const documentFinal = saved.get("documentFinal");
        resultats.push({ devise: evt.devise, banqueCentrale: evt.banqueCentrale, categorie: evt.categorie, status: "ok", documentFinal });

        await mettreAJourFichierDevise(evt.devise, {
          date: dateISOJour,
          banqueCentrale: evt.banqueCentrale,
          categorie: evt.categorie,
          status: "ok",
          documentFinal,
        });

      } catch (error) {
        console.error(`Erreur scraping ${evt.banqueCentrale}/${evt.categorie} :`, error);
        await enregistrerDocumentFinal(entree.id, []);
        resultats.push({ devise: evt.devise, categorie: evt.categorie, status: "error", message: error.message, documentFinal: [] });
      }
    }

    const cleR2 = genererCleDuJour("banque-centrale");
    await ecrireJSONDansR2(cleR2, {
      generatedAt: new Date().toISOString(),
      source: "pipeline/run (manuel)",
      count: resultats.filter((r) => r.status === "ok").length,
      data: resultats,
    });

    return NextResponse.json({ status: "ok", cleR2, resultats });
  } catch (error) {
    console.error("Erreur pipeline manuel :", error);
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
