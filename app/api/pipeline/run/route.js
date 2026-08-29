// app/api/pipeline/run/route.js
// Déclenché par le bouton du dashboard — exécute tout le pipeline en une
// fois pour TOUS les événements bancaires du jour, sans attendre les crons.
//
// Historique : chemin Render cassé corrigé, fermeture propre des entrées
// en erreur, retrait du fallback recupererDernierEventConnu (28/08),
// écriture par devise ajoutée puis chemin renommé vers
// database/banque-centrale/ (29/08), mettreAJourFichierDevise partagée.
//
// FIX 10 (29/08) : même correction que central-bank-scrape/route.js —
// utilise contenuEstSuffisant() au lieu de phrases.length === 0, pour
// rester cohérent avec ce qu'enregistrerDocumentFinal() décide en
// interne (voir lib/central-bank-pipeline-service.js).

import { NextResponse } from "next/server";
import { lireEvenementsDuJour } from "../../../../lib/reconnaissance-service";
import { DEVISE_TO_BANQUE, trouverCategoriePourEvenement } from "../../../../lib/central-bank-keywords";
import { filtrerParagraphes } from "../../../../lib/paragraph-filter-service";
import {
  enregistrerReconnaissance,
  enregistrerDocumentFinal,
  contenuEstSuffisant,
} from "../../../../lib/central-bank-pipeline-service";
import { mettreAJourFichierDevise } from "../../../../lib/central-bank-archive-r2";
import { scraperBanqueCentraleViaRender } from "../../../../lib/central-bank-render-client";
import { ecrireJSONDansR2, genererCleDuJour } from "../../../../lib/r2-client";

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
 * POST /api/pipeline/run
 *
 * Architecture stricte, deux issues possibles par événement bancaire
 * détecté aujourd'hui via le calendrier BC :
 *   - "ok"   : contenu réel scrapé (statement/minutes/discours/...) ET
 *              suffisant (contenuEstSuffisant)
 *   - "skip" : rien de pertinent trouvé, ou contenu insuffisant —
 *              documentFinal vide dans les deux cas.
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

        if (!contenuEstSuffisant(phrases)) {
          await enregistrerDocumentFinal(entree.id, phrases);
          resultats.push({
            devise: evt.devise,
            banqueCentrale: evt.banqueCentrale,
            categorie: evt.categorie,
            status: "skip",
            reason: phrases.length === 0 ? "aucun mot-clé trouvé" : `contenu insuffisant (${phrases.length} phrase(s), seuil minimum non atteint)`,
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
