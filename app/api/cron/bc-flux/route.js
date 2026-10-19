// app/api/cron/bc-flux/route.js
//
// Flux continu d'UNE banque centrale par appel : GET ?banque=ECB
//
//   Render (/scrape/central-bank-meta) -> filtre mots-cles -> bc_documents
//   (deduplication par hash) -> bc_reference
//
// Une banque par appel (et non les 8 d'un coup) : chaque scraping Render
// peut prendre plusieurs secondes, 8 banques x 6 categories depasseraient
// maxDuration. Le workflow GitHub Actions lance une banque par job
// (matrice) - ajouter une banque = une ligne dans BANQUES_FLUX, une ligne
// dans la matrice, et son scraperXxxAvecMeta cote Render.
//
// La Fed n'est pas ici : elle a deja son flux (app/api/test/central-bank-fed),
// lu par app/api/cron/bc-state.
//
// La logique vit dans lib/bc-state/bc-flux.js. Aucun appel IA ici.

import { NextResponse } from "next/server";
import { scraperBanqueCentraleAvecMetaViaRender } from "../../../../lib/central-bank-meta-client";
import { filtrerParagraphes } from "../../../../lib/paragraph-filter-service";
import { ingurgiterHistorique } from "../../../../lib/bc-state/bc-documents";
import { construireBcReference } from "../../../../lib/bc-state/bc-reference";
import { executerFlux } from "../../../../lib/bc-state/bc-flux";

export const maxDuration = 120;

const BANQUES_FLUX = ["ECB"];

export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const banque = new URL(request.url).searchParams.get("banque");
  if (!BANQUES_FLUX.includes(banque)) {
    return NextResponse.json(
      { error: `Banque non disponible : "${banque}"`, disponibles: BANQUES_FLUX },
      { status: 400 }
    );
  }

  try {
    const { horodatageRun, entrees, ingestion } = await executerFlux(banque, {
      scraper: scraperBanqueCentraleAvecMetaViaRender,
      filtrer: filtrerParagraphes,
      ingerer: ingurgiterHistorique,
    });

    // bc_reference exige un statement date : peut echouer tant que le
    // premier statement n'est pas ingere - ce n'est pas une erreur du flux
    let reference = null;
    let erreurReference = null;
    try {
      const ref = await construireBcReference(banque);
      reference = { referenceDate: ref.referenceDate };
    } catch (error) {
      erreurReference = error.message;
    }

    return NextResponse.json({
      status: "ok",
      banque,
      horodatageRun,
      resultats: entrees.map((e) => ({
        categorie: e.categorie,
        status: e.status,
        phrases: e.documentFinal.length,
        pubDate: e.pubDate,
        source: e.source,
        erreur: e.messageErreur,
      })),
      ingestion,
      reference,
      erreurReference,
    });
  } catch (error) {
    console.error(`[bc-flux] ${banque} :`, error);
    return NextResponse.json({ status: "error", banque, message: error.message }, { status: 500 });
  }
}
