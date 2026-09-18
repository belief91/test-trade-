// app/api/cron/central-bank-scrape/route.js
//
// Historique des fix : chemin Render cassé (26/08), entrées orphelines +
// bug de requête Parse sur champ absent (27-28/08), trace R2 même si
// rien à traiter (28/08), retrait du fallback recupererDernierEventConnu
// (28/08), chemin renommé vers database/banque-centrale/ (29/08),
// mettreAJourFichierDevise partagée (29/08), FIX 10 seuil unifié
// contenuEstSuffisant (29/08).
//
// FIX (16/09) : ingestion automatique bc_documents à la fin de chaque
// cycle — pour chaque devise réellement touchée ce run,
// ingurgiterDepuisArchiveDevise() relit database/banque-centrale/
// {devise}.json (déjà à jour via mettreAJourFichierDevise) et déduplique
// par hash dans bc_documents. Plus besoin de lancer le script manuel
// bc-state-builder.js après coup — l'entrepôt déduplié se construit tout
// seul à chaque scraping réel.

import { NextResponse } from "next/server";
import {
  lireReconnaissancesDuJour,
  enregistrerDocumentFinal,
  enregistrerEchecScraping,
  contenuEstSuffisant,
} from "../../../../lib/central-bank-pipeline-service";
import { mettreAJourFichierDevise } from "../../../../lib/central-bank-archive-r2";
import { scraperBanqueCentraleViaRender } from "../../../../lib/central-bank-render-client";
import { filtrerParagraphes } from "../../../../lib/paragraph-filter-service";
import { ingurgiterDepuisArchiveDevise } from "../../../../lib/bc-state/bc-documents";
import {
  ecrireJSONDansR2,
  genererCleDuJour,
  genererCleArchiveDuJour,
} from "../../../../lib/r2-client";

export const maxDuration = 60;

/**
 * GET /api/cron/central-bank-scrape
 *
 * Architecture stricte, deux issues possibles par entrée traitée :
 *   - "ok"   : événement bancaire du jour trouvé + contenu réel scrapé
 *              ET suffisant (contenuEstSuffisant)
 *   - "skip" : rien de pertinent trouvé, OU contenu trouvé mais
 *              insuffisant (ex: mention légale seule) — documentFinal
 *              vide dans les deux cas, jamais de contenu de
 *              substitution venant d'un autre jour/événement.
 *   - "error": échec technique du scraping (retenté aux prochains crons
 *              tant que tentatives < 3)
 *
 * En fin de cycle : ingestion automatique dans bc_documents pour chaque
 * devise touchée (voir FIX 16/09 ci-dessus).
 */
export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entrees = await lireReconnaissancesDuJour();

  if (entrees.length === 0) {
    const cleR2Vide = genererCleDuJour("banque-centrale");
    await ecrireJSONDansR2(cleR2Vide, {
      generatedAt: new Date().toISOString(),
      source: "cron/central-bank-scrape (automatique)",
      status: "skip",
      reason: "aucune entrée pending à traiter",
      count: 0,
      data: [],
    });
    return NextResponse.json({ status: "skip", reason: "aucune entrée pending a traiter", cleR2: cleR2Vide });
  }

  const resultats = [];
  const dateISOJour = new Date().toISOString().split("T")[0];
  const devisesTouchees = new Set();

  for (const entree of entrees) {
    const banqueCentrale = entree.get("banqueCentrale");
    const categorie = entree.get("categorie");
    const devise = entree.get("deviseDetectee");

    try {
      const texte = await scraperBanqueCentraleViaRender(banqueCentrale, categorie);

      const phrases = filtrerParagraphes(texte, banqueCentrale);

      if (!contenuEstSuffisant(phrases)) {
        await enregistrerDocumentFinal(entree.id, phrases);
        resultats.push({
          devise,
          banqueCentrale,
          categorie,
          status: "skip",
          reason: phrases.length === 0 ? "aucun mot-clé trouvé" : `contenu insuffisant (${phrases.length} phrase(s), seuil minimum non atteint)`,
          documentFinal: [],
        });

        if (devise) {
          await mettreAJourFichierDevise(devise, {
            date: dateISOJour,
            banqueCentrale,
            categorie,
            status: "skip",
            documentFinal: [],
          });
          devisesTouchees.add(devise);
        }
        continue;
      }

      const saved = await enregistrerDocumentFinal(entree.id, phrases);
      const documentFinal = saved.get("documentFinal");
      resultats.push({ devise, banqueCentrale, categorie, status: "ok", documentFinal });

      if (devise) {
        await mettreAJourFichierDevise(devise, {
          date: dateISOJour,
          banqueCentrale,
          categorie,
          status: "ok",
          documentFinal,
        });
        devisesTouchees.add(devise);
      }

    } catch (error) {
      console.error(`Erreur scraping ${banqueCentrale}/${categorie} :`, error);
      const entreeMaj = await enregistrerEchecScraping(entree.id, error.message);
      resultats.push({
        devise,
        categorie,
        status: "error",
        message: error.message,
        tentatives: entreeMaj.get("tentatives"),
        documentFinal: [],
      });
    }
  }

  const cleR2 = genererCleDuJour("banque-centrale");
  await ecrireJSONDansR2(cleR2, {
    generatedAt: new Date().toISOString(),
    source: "cron/central-bank-scrape (automatique)",
    count: resultats.filter((r) => r.status === "ok").length,
    data: resultats,
  });

  const cleArchive = genererCleArchiveDuJour("banque-centrale");
  await ecrireJSONDansR2(cleArchive, {
    archivedAt: new Date().toISOString(),
    count: resultats.filter((r) => r.status === "ok").length,
    data: resultats,
  });

  // FIX (16/09) : ingestion bc_documents pour chaque devise touchée ce
  // cycle — non bloquant pour la réponse principale si une devise échoue
  const ingestionBcDocuments = {};
  for (const devise of devisesTouchees) {
    try {
      ingestionBcDocuments[devise] = await ingurgiterDepuisArchiveDevise(devise);
    } catch (err) {
      console.error(`Erreur ingestion bc_documents pour ${devise} :`, err);
      ingestionBcDocuments[devise] = { erreur: err.message };
    }
  }

  return NextResponse.json({ status: "ok", cleR2, cleArchive, resultats, ingestionBcDocuments });
}
