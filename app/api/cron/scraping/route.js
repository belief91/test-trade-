import { NextResponse } from "next/server";
import Parse from "../../../../lib/back4app-server.js";

// Donne le maximum de temps possible à cette route sur le plan Hobby Vercel
// (avec Fluid Compute), pour absorber un éventuel cold start de Render
// (le service gratuit se met en veille après inactivité, réveil ~30-60s).
export const maxDuration = 60;

/**
 * GET /api/cron/scraping
 *
 * Appelé automatiquement par Vercel Cron tous les jours à 19h00 UTC
 * (voir vercel.json). Cette route NE scrape PLUS directement — elle
 * délègue le travail à un service Render (pas de limite de temps
 * d'exécution), récupère le JSON, puis sauvegarde dans Back4App ici
 * (les clés Back4App restent uniquement côté Vercel, pas dupliquées
 * sur Render).
 *
 * ⚠️ ACTION REQUISE :
 *   1. Déployer le service Render (dossier séparé beliefx-render-scraper/)
 *   2. Ajouter dans Vercel (Environment Variables) ET .env.local :
 *      - RENDER_SCRAPER_URL = https://<ton-service>.onrender.com
 *      - RENDER_SCRAPER_SECRET = même valeur que celle définie sur Render
 *
 * Sécurité : double vérification —
 *   - Vercel vérifie CRON_SECRET (que ce soit bien Vercel/cron qui appelle
 *     cette route)
 *   - Render vérifie RENDER_SCRAPER_SECRET (que ce soit bien cette route
 *     Vercel qui l'appelle, pas n'importe qui d'autre)
 */
export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const renderUrl = process.env.RENDER_SCRAPER_URL;
    const renderSecret = process.env.RENDER_SCRAPER_SECRET;

    if (!renderUrl || !renderSecret) {
      throw new Error(
        "RENDER_SCRAPER_URL ou RENDER_SCRAPER_SECRET manquant dans les variables d'environnement"
      );
    }

    const renderResponse = await fetch(`${renderUrl}/scrape/calendar-bc`, {
      headers: { Authorization: `Bearer ${renderSecret}` },
    });

    if (!renderResponse.ok) {
      throw new Error(
        `Échec de l'appel au service Render : HTTP ${renderResponse.status}`
      );
    }

    const { success, data: evenements, error: renderError } =
      await renderResponse.json();

    if (!success) {
      throw new Error(renderError || "Le service Render a renvoyé une erreur");
    }

    const CentralBankCalendar = Parse.Object.extend("CentralBankCalendar");
    const objets = evenements.map((e) => {
      const obj = new CentralBankCalendar();
      obj.set("date", e.date);
      obj.set("heureGmt3", e.heureGmt3);
      obj.set("devise", e.devise);
      obj.set("evenement", e.evenement);
      obj.set("reel", e.reel);
      obj.set("precedent", e.precedent);
      obj.set("consensus", e.consensus);
      obj.set("prevision", e.prevision);
      obj.set("impact", e.impact);
      return obj;
    });
    await Parse.Object.saveAll(objets, { useMasterKey: true });

    return NextResponse.json({
      success: true,
      count: evenements.length,
    });
  } catch (error) {
    console.error("Erreur cron scraping calendrier BC :", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}