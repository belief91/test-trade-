import { NextResponse } from "next/server";
import { scraperCalendrierBC } from "../../../lib/central-bank-calendar-service.js";
import Parse from "../../../lib/back4app-server.js";
import { ecrireJSONDansR2, genererCleDuJour } from "../../../lib/r2-client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function sauvegarderVersBack4App(evenements) {
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

  return Parse.Object.saveAll(objets, { useMasterKey: true });
}

/**
 * GET /api/central-bank-calendar
 *
 * Scrape les événements BC à fort impact (G10, semaine en cours),
 * sauvegarde dans Back4App ET upload vers R2 pour la fusion journalière.
 * Clé R2 : raw/{date}/calendrier-bc.json (date GMT+3)
 */
export async function GET() {
  try {
    const evenements = await scraperCalendrierBC();

    // 1. Sauvegarde Back4App (historique complet)
    await sauvegarderVersBack4App(evenements);

    // 2. Upload R2 — données du jour pour la synthèse IA de 6h GMT+3
    const cleR2 = genererCleDuJour("calendrier-bc");
    await ecrireJSONDansR2(cleR2, {
      scrapedAt: new Date().toISOString(),
      count: evenements.length,
      data: evenements,
    });

    return NextResponse.json({
      success: true,
      count: evenements.length,
      cleR2,
      data: evenements,
    });
  } catch (error) {
    console.error("Erreur scraping calendrier BC :", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
