import { NextResponse } from "next/server";
import Parse from "../../../../lib/back4app-server.js";

export const maxDuration = 60;

/**
 * GET /api/cron/scraping
 *
 * Appelé automatiquement par Vercel Cron tous les jours à 19h00 UTC
 * (voir vercel.json). Scrape le calendrier BC via Render, puis
 * VIDE la table CentralBankCalendar avant de réinsérer les données
 * fraîches — évite l'accumulation de doublons à chaque passage
 * hebdomadaire (le calendrier est une fenêtre roulante, pas un
 * historique permanent).
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

    // Nettoyage : supprime toutes les entrées existantes avant de
    // réinsérer le calendrier frais.
    const requeteExistants = new Parse.Query(CentralBankCalendar);
    requeteExistants.limit(1000);
    const existants = await requeteExistants.find({ useMasterKey: true });
    if (existants.length > 0) {
      await Parse.Object.destroyAll(existants, { useMasterKey: true });
    }

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
