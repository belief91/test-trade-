import { NextResponse } from "next/server";
import { scraperCalendrierBC } from "../../../lib/central-bank-calendar-service.js";
import Parse from "../../../lib/back4app-server.js";
import { ecrireJSONDansR2, genererCleDuJour, genererCleArchiveDuJour } from "../../../lib/r2-client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Upsert des événements calendrier — dédoublonnage sur (devise + evenement
 * + date). Sans ça, chaque appel (cron + clics "Recharger") créait une
 * nouvelle ligne pour le même événement au lieu de mettre à jour la ligne
 * existante (ex: "reel" qui passe de vide à une vraie valeur une fois
 * l'événement publié).
 */
async function upsertVersBack4App(evenements) {
  const CentralBankCalendar = Parse.Object.extend("CentralBankCalendar");
  let nouveaux = 0;
  let misAJour = 0;

  for (const e of evenements) {
    const requete = new Parse.Query(CentralBankCalendar);
    requete.equalTo("devise", e.devise);
    requete.equalTo("evenement", e.evenement);
    requete.equalTo("date", e.date);
    const existant = await requete.first({ useMasterKey: true });

    const obj = existant || new CentralBankCalendar();
    obj.set("date", e.date);
    obj.set("heureGmt3", e.heureGmt3);
    obj.set("devise", e.devise);
    obj.set("evenement", e.evenement);
    obj.set("reel", e.reel);
    obj.set("precedent", e.precedent);
    obj.set("consensus", e.consensus);
    obj.set("prevision", e.prevision);
    obj.set("impact", e.impact);

    await obj.save(null, { useMasterKey: true });
    if (existant) {
      misAJour++;
    } else {
      nouveaux++;
    }
  }

  return { nouveaux, misAJour };
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

    // 1. Upsert Back4App (dédoublonnage devise+evenement+date)
    const { nouveaux, misAJour } = await upsertVersBack4App(evenements);

    // 2. Upload R2 — données du jour pour la synthèse IA de 6h GMT+3
    const cleR2 = genererCleDuJour("calendrier-bc");
    await ecrireJSONDansR2(cleR2, {
      scrapedAt: new Date().toISOString(),
      count: evenements.length,
      data: evenements,
    });

    // 3. Archive permanente — database/calendrier-bc/{date}.json, jamais
    // écrasée ni nettoyée, backup durable en plus de Back4App
    const cleArchive = genererCleArchiveDuJour("calendrier-bc");
    await ecrireJSONDansR2(cleArchive, {
      archivedAt: new Date().toISOString(),
      count: evenements.length,
      data: evenements,
    });

    return NextResponse.json({
      success: true,
      count: evenements.length,
      nouveaux,
      misAJour,
      cleR2,
      cleArchive,
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
