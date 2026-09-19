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
// {devise}.json et déduplique par hash dans bc_documents.
//
// FIX (19/09) : reconstruction automatique de bc_reference, mais
// UNIQUEMENT pour les banques dont bc_documents a réellement grossi ce
// cycle (nouveaux > 0) — évite une écriture R2 inutile les jours où tout
// était skip/error/déjà-vu.

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
import { construireBcReference } from "../../../../lib/bc-state/bc-reference";
import {
  ecrireJSONDansR2,
  genererCleDuJour,
  genererCleArchiveDuJour,
} from "../../../../lib/r2-client";

export const maxDuration = 60;

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

  // FIX (16/09) : ingestion bc_documents par devise touchée
  const ingestionBcDocuments = {};
  const banquesAVerifierPourReference = new Set();

  for (const devise of devisesTouchees) {
    try {
      const resultatIngestion = await ingurgiterDepuisArchiveDevise(devise);
      ingestionBcDocuments[devise] = resultatIngestion;

      // FIX (19/09) : marque pour reconstruction de reference uniquement
      // les banques dont bc_documents a reellement grossi ce cycle
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

  return NextResponse.json({
    status: "ok",
    cleR2,
    cleArchive,
    resultats,
    ingestionBcDocuments,
    referencesMisesAJour,
  });
}
