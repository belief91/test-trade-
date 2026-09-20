// app/api/pipeline/run/route.js
// Déclenché par le bouton du dashboard — exécute tout le pipeline en une
// fois pour TOUS les événements bancaires du jour, sans attendre les crons.
//
// Historique : chemin Render cassé corrigé, fermeture propre des entrées
// en erreur, retrait du fallback recupererDernierEventConnu (28/08),
// écriture par devise ajoutée puis chemin renommé vers
// database/banque-centrale/ (29/08), mettreAJourFichierDevise partagée,
// FIX 10 contenuEstSuffisant (29/08).
//
// FIX (16/09) : ingestion automatique bc_documents à la fin du cycle.
//
// FIX (19/09) : reconstruction automatique de bc_reference, uniquement
// pour les banques dont bc_documents a réellement grossi ce cycle —
// même logique que central-bank-scrape/route.js, pour rester cohérent
// entre les deux points d'entrée qui écrivent tous deux dans
// database/banque-centrale/{devise}.json.

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
import { ingurgiterDepuisArchiveDevise } from "../../../../lib/bc-state/bc-documents";
import { construireBcReference } from "../../../../lib/bc-state/bc-reference";
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
    const devisesTouchees = new Set();

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
          devisesTouchees.add(evt.devise);
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
        devisesTouchees.add(evt.devise);

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

    // FIX (16/09) : ingestion bc_documents par devise touchée
    const ingestionBcDocuments = {};
    const banquesAVerifierPourReference = new Set();

    for (const devise of devisesTouchees) {
      try {
        const resultatIngestion = await ingurgiterDepuisArchiveDevise(devise);
        ingestionBcDocuments[devise] = resultatIngestion;

        for (const [banque, stats] of Object.entries(resultatIngestion.banques || {})) {
          if (stats.nouveaux > 0) {
            banquesAVerifierPourReference.add(banque);
          }
        }
      } catch (err) {
        console.error(`Erreur ingestion bc_documents pour ${devise} :`, err);
        ingestionBcDocuments[devise] = { erreur: err.message };
      }
    }

    // FIX (19/09) : reconstruction bc_reference, seulement si necessaire
    const referencesMisesAJour = {};
    for (const banque of banquesAVerifierPourReference) {
      try {
        const reference = await construireBcReference(banque);
        referencesMisesAJour[banque] = { referenceDate: reference.referenceDate };
      } catch (err) {
        console.error(`Erreur construction bc_reference pour ${banque} :`, err);
        referencesMisesAJour[banque] = { erreur: err.message };
      }
    }

    return NextResponse.json({ status: "ok", cleR2, resultats, ingestionBcDocuments, referencesMisesAJour });
  } catch (error) {
    console.error("Erreur pipeline manuel :", error);
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
