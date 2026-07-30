// app/api/cron/central-bank-scrape/route.js
import { NextResponse } from "next/server";
import {
  lireReconnaissancesDuJour,
  enregistrerDocumentFinal,
  recupererDernierEventConnu,
} from "../../../../lib/central-bank-pipeline-service";
import { filtrerParagraphes } from "../../../../lib/paragraph-filter-service";

export const maxDuration = 60;

/**
 * GET /api/cron/central-bank-scrape
 *
 * Boucle sur TOUTES les entrées "pending" du jour (plusieurs événements
 * bancaires possibles le même jour, ex: EUR/statement ET GBP/statement).
 * Pour chacune : scrape la catégorie précise via Render, filtre par
 * phrase, enregistre le document final.
 */
export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entrees = await lireReconnaissancesDuJour();

  if (entrees.length === 0) {
    return NextResponse.json({ status: "skip", reason: "aucune entrée pending aujourd'hui" });
  }

  const resultats = [];

  for (const entree of entrees) {
    const banqueCentrale = entree.get("banqueCentrale");
    const categorie = entree.get("categorie");
    const devise = entree.get("deviseDetectee");

    try {
      const renderUrl = process.env.RENDER_SCRAPER_URL;
      const renderSecret = process.env.RENDER_SCRAPER_SECRET;

      if (!renderUrl || !renderSecret) {
        throw new Error("RENDER_SCRAPER_URL ou RENDER_SCRAPER_SECRET manquant");
      }

      const renderResponse = await fetch(`${renderUrl}/scrape/central-bank-statement`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${renderSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ banque: banqueCentrale, categorie }),
      });

      if (!renderResponse.ok) {
        throw new Error(`Échec appel Render : HTTP ${renderResponse.status}`);
      }

      const { success, texte, error: renderError } = await renderResponse.json();
      if (!success) {
        throw new Error(renderError || "Le service Render a renvoyé une erreur");
      }

      const phrases = filtrerParagraphes(texte, banqueCentrale);

      if (phrases.length === 0) {
        await enregistrerDocumentFinal(entree.id, []);
        const fallback = await recupererDernierEventConnu(devise);
        resultats.push({
          devise,
          categorie,
          status: "skip",
          reason: "aucun mot-clé trouvé après scraping",
          dernierEventConnu: fallback ? fallback.get("documentFinal") : null,
        });
        continue;
      }

      const saved = await enregistrerDocumentFinal(entree.id, phrases);
      resultats.push({
        devise,
        categorie,
        status: "ok",
        documentFinal: saved.get("documentFinal"),
      });
    } catch (error) {
      console.error(`Erreur scraping ${banqueCentrale}/${categorie} :`, error);
      resultats.push({ devise, categorie, status: "error", message: error.message });
    }
  }

  return NextResponse.json({ status: "ok", resultats });
}
