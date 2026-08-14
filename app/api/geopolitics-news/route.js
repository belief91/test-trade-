// app/api/geopolitics-news/route.js
//
// AJOUT : filtrage par pertinence trading (lib/geopolitics-filter-service.js)
// appliqué UNIQUEMENT à ce qui est écrit sur R2 (raw/{date}/geopolitics-tv5monde.json,
// le fichier que l'IA consomme). Le scraping TV5MONDE et l'archive
// Back4App (GeopoliticalNews, via upsertArticlesGeopolitiques) restent
// INTACTS et non filtrés — aucune régression sur l'historique complet.
// Corrige la consommation de tokens inutile : l'IA recevait auparavant
// des dizaines d'articles bruts sans rapport avec le trading.

import { NextResponse } from "next/server";
import {
  upsertArticlesGeopolitiques,
  recupererArticlesDernieres24h,
} from "../../../lib/geopolitics-pipeline-service";
import { filtrerArticlesPertinentsTrading } from "../../../lib/geopolitics-filter-service";
import { ecrireJSONDansR2, genererCleDuJour } from "../../../lib/r2-client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

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

    // Archive complète, non filtrée — comportement inchangé
    const nouveaux = await upsertArticlesGeopolitiques(articlesScrapes);
    const fenetre24h = await recupererArticlesDernieres24h();

    // Filtrage pertinence trading — UNIQUEMENT pour R2/IA
    const fenetre24hFiltree = filtrerArticlesPertinentsTrading(fenetre24h);

    const cleR2 = genererCleDuJour("geopolitics-tv5monde");
    await ecrireJSONDansR2(cleR2, {
      generatedAt: new Date().toISOString(),
      source: "TV5MONDE (rubrique International)",
      nouveauxArticles: nouveaux,
      countBrut: fenetre24h.length,
      countFiltre: fenetre24hFiltree.length,
      data: fenetre24hFiltree,
    });

    return NextResponse.json({
      success: true,
      nouveauxArticles: nouveaux,
      countBrut: fenetre24h.length,
      countFiltre: fenetre24hFiltree.length,
      cleR2,
      data: fenetre24hFiltree,
    });
  } catch (error) {
    console.error("Erreur pipeline géopolitique TV5MONDE :", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
