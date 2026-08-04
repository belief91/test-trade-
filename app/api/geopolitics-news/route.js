// app/api/geopolitics-news/route.js
import { NextResponse } from "next/server";
import {
  upsertArticlesGeopolitiques,
  recupererArticlesDernieres24h,
} from "../../../lib/geopolitics-pipeline-service";
import { ecrireJSONDansR2, genererCleDuJour } from "../../../lib/r2-client";

export const maxDuration = 60;

/**
 * GET /api/geopolitics-news
 *
 * Scrape la rubrique "International" de TV5MONDE via le service Render,
 * upsert les articles dans Back4App (dédoublonnage sur `url`), relit la
 * fenêtre glissante des dernières 24h, et réécrit le JSON consolidé sur R2
 * (raw/{date}/geopolitics-tv5monde.json — même convention que les autres
 * modules, pour que la synthèse IA le retrouve automatiquement).
 *
 * Pas de secret requis (même pattern que /api/central-bank-calendar) car
 * cette route est appelée à la fois par :
 * - le bouton "Recharger" côté UI (appel direct depuis le navigateur)
 * - le cron GitHub Actions toutes les 4h, ancré sur 5h15 GMT+3
 *
 * Chaque exécution est idempotente : rejouer la route plusieurs fois de
 * suite ne duplique rien (dédoublonnage sur url) et régénère juste la
 * fenêtre 24h à jour.
 */
export async function GET() {
  try {
    const renderUrl = process.env.RENDER_SCRAPER_URL;
    const renderSecret = process.env.RENDER_SCRAPER_SECRET;

    if (!renderUrl || !renderSecret) {
      throw new Error("RENDER_SCRAPER_URL ou RENDER_SCRAPER_SECRET manquant");
    }

    const renderResponse = await fetch(`${renderUrl}/scrape/geopolitics/tv5monde`, {
      headers: { Authorization: `Bearer ${renderSecret}` },
    });

    if (!renderResponse.ok) {
      throw new Error(`Échec appel Render : HTTP ${renderResponse.status}`);
    }

    const { success, data: articlesScrapes, error: renderError } = await renderResponse.json();

    if (!success) {
      throw new Error(renderError || "Le service Render a renvoyé une erreur");
    }

    const nouveaux = await upsertArticlesGeopolitiques(articlesScrapes);
    const fenetre24h = await recupererArticlesDernieres24h();

    const cleR2 = genererCleDuJour("geopolitics-tv5monde");
    await ecrireJSONDansR2(cleR2, {
      generatedAt: new Date().toISOString(),
      source: "TV5MONDE (rubrique International)",
      nouveauxArticles: nouveaux,
      count: fenetre24h.length,
      data: fenetre24h,
    });

    return NextResponse.json({
      success: true,
      nouveauxArticles: nouveaux,
      count: fenetre24h.length,
      cleR2,
      data: fenetre24h,
    });
  } catch (error) {
    console.error("Erreur pipeline géopolitique TV5MONDE :", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
