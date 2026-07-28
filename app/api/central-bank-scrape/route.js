// app/api/cron/central-bank-scrape/route.js
import { NextResponse } from "next/server";
import {
  lireReconnaissanceDuJour,
  enregistrerDocumentFinal,
  recupererDernierEventConnu,
} from "../../../../lib/central-bank-pipeline-service";
import { filtrerParagraphes } from "../../../../lib/paragraph-filter-service";

// Même logique que app/api/cron/scraping/route.js : Render peut avoir un cold start.
export const maxDuration = 60;

/**
 * GET /api/cron/central-bank-scrape
 *
 * Appelé automatiquement par Vercel Cron (voir vercel.json, 19h00 UTC).
 * Lit l'entrée "pending" créée le matin par /api/cron/reconnaissance,
 * scrape UNIQUEMENT la banque centrale ciblée via Render, filtre les
 * paragraphes par mots-clés, et enregistre le document final.
 *
 * Sécurité : même double vérification que le cron scraping existant.
 */
export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const entree = await lireReconnaissanceDuJour();

    if (!entree) {
      return NextResponse.json({ status: "skip", reason: "aucune entrée pending aujourd'hui" });
    }

    const banqueCentrale = entree.get("banqueCentrale");
    const devise = entree.get("deviseDetectee");

    const renderUrl = process.env.RENDER_SCRAPER_URL;
    const renderSecret = process.env.RENDER_SCRAPER_SECRET;

    if (!renderUrl || !renderSecret) {
      throw new Error(
        "RENDER_SCRAPER_URL ou RENDER_SCRAPER_SECRET manquant dans les variables d'environnement"
      );
    }

    const renderResponse = await fetch(`${renderUrl}/scrape/central-bank-statement`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${renderSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ banque: banqueCentrale }),
    });

    if (!renderResponse.ok) {
      throw new Error(`Échec de l'appel au service Render : HTTP ${renderResponse.status}`);
    }

    const { success, texte, error: renderError } = await renderResponse.json();

    if (!success) {
      throw new Error(renderError || "Le service Render a renvoyé une erreur");
    }

    const paragraphes = filtrerParagraphes(texte, banqueCentrale);

    if (paragraphes.length === 0) {
      await enregistrerDocumentFinal(entree.id, []);
      const fallback = await recupererDernierEventConnu(devise);
      return NextResponse.json({
        status: "skip",
        reason: "aucun mot-clé trouvé après scraping",
        dernierEventConnu: fallback ? fallback.get("documentFinal") : null,
      });
    }

    const saved = await enregistrerDocumentFinal(entree.id, paragraphes);
    return NextResponse.json({ status: "ok", documentFinal: saved.get("documentFinal") });
  } catch (error) {
    console.error("Erreur cron central-bank-scrape :", error);
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
