// app/api/cron/central-bank-scrape/route.js
//
// Historique des fix : chemin Render cassé (26/08), entrées orphelines +
// bug de requête Parse sur champ absent (27-28/08), trace R2 même si
// rien à traiter (28/08).
//
// FIX 6 (28/08) : retrait complet du fallback recupererDernierEventConnu.
// Ne correspond pas à l'architecture voulue : soit un événement bancaire
// du jour est trouvé via le calendrier BC et on scrape son contenu réel
// (statement/minutes/discours/...), soit rien n'est trouvé et c'est un
// "skip" — jamais un troisième état où on ressort le contenu d'un ANCIEN
// événement (potentiellement une autre catégorie, une autre date) pour
// combler le vide. C'est ce fallback qui faisait apparaître des données
// "venues de nulle part" (ex: contenu d'un vieux discours affiché comme
// si c'était la publication du jour, alors que l'événement du jour
// n'avait simplement rien donné). Désormais : phrases.length === 0 =>
// status "skip", documentFinal vide, point final — pas de contenu de
// substitution.

import { NextResponse } from "next/server";
import {
  lireReconnaissancesDuJour,
  enregistrerDocumentFinal,
  enregistrerEchecScraping,
} from "../../../../lib/central-bank-pipeline-service";
import { scraperBanqueCentraleViaRender } from "../../../../lib/central-bank-render-client";
import { filtrerParagraphes } from "../../../../lib/paragraph-filter-service";
import {
  ecrireJSONDansR2,
  lireJSONDepuisR2,
  genererCleDuJour,
  genererCleArchiveDuJour,
} from "../../../../lib/r2-client";

export const maxDuration = 60;

async function mettreAJourFichierDevise(devise, entreeDuJour) {
  const cleDevise = `banques-centrales/${devise}.json`;

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
 * GET /api/cron/central-bank-scrape
 *
 * Architecture stricte, deux issues possibles par entrée traitée :
 *   - "ok"   : événement bancaire du jour trouvé + contenu réel scrapé
 *              (statement/minutes/discours/... selon la catégorie)
 *   - "skip" : rien de pertinent trouvé (aucun mot-clé dans le texte
 *              scrapé) — documentFinal reste vide, jamais de contenu
 *              de substitution venant d'un autre jour/événement.
 *   - "error": échec technique du scraping (retenté aux prochains crons
 *              tant que tentatives < 3, voir central-bank-pipeline-service.js)
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

  for (const entree of entrees) {
    const banqueCentrale = entree.get("banqueCentrale");
    const categorie = entree.get("categorie");
    const devise = entree.get("deviseDetectee");

    try {
      const texte = await scraperBanqueCentraleViaRender(banqueCentrale, categorie);

      const phrases = filtrerParagraphes(texte, banqueCentrale);

      if (phrases.length === 0) {
        await enregistrerDocumentFinal(entree.id, []);
        resultats.push({
          devise,
          banqueCentrale,
          categorie,
          status: "skip",
          reason: "aucun mot-clé trouvé",
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

  return NextResponse.json({ status: "ok", cleR2, cleArchive, resultats });
}
