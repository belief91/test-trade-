// app/api/central-bank-calendar/route.js
//
// FIX v2 : remplace la fusion manuelle par une reconstruction complete
// depuis Back4App a chaque execution - inclut desormais l'historique
// importe manuellement, pas seulement les scrapes futurs. Elimine aussi
// la creation de fichiers dates (database/calendrier-bc/{date}.json).

import { NextResponse } from "next/server";
import { scraperCalendrierBC } from "../../../lib/central-bank-calendar-service.js";
import Parse from "../../../lib/back4app-server.js";
import { ecrireJSONDansR2, genererCleDuJour } from "../../../lib/r2-client";
import { construireContexteMacroDuJour } from "../../../lib/macro-consolidator-service";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CLE_ARCHIVE_CONSOLIDEE = "database/calendrier-bc/archive-consolide.json";

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

async function reconstruireArchiveConsolidee() {
  const CentralBankCalendar = Parse.Object.extend("CentralBankCalendar");
  const requete = new Parse.Query(CentralBankCalendar);
  requete.limit(10000);

  const tous = await requete.find({ useMasterKey: true });

  const data = tous
    .map((obj) => ({
      date: obj.get("date"),
      heureGmt3: obj.get("heureGmt3"),
      devise: obj.get("devise"),
      evenement: obj.get("evenement"),
      reel: obj.get("reel"),
      precedent: obj.get("precedent"),
      consensus: obj.get("consensus"),
      prevision: obj.get("prevision"),
      impact: obj.get("impact"),
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  await ecrireJSONDansR2(CLE_ARCHIVE_CONSOLIDEE, {
    updatedAt: new Date().toISOString(),
    count: data.length,
    data,
  });

  return { cle: CLE_ARCHIVE_CONSOLIDEE, count: data.length };
}

export async function GET() {
  try {
    const evenements = await scraperCalendrierBC();

    const { nouveaux, misAJour } = await upsertVersBack4App(evenements);

    const contexteMacro = await construireContexteMacroDuJour(evenements);

    const cleR2 = genererCleDuJour("calendrier-bc");
    await ecrireJSONDansR2(cleR2, {
      scrapedAt: new Date().toISOString(),
      count: evenements.length,
      data: evenements,
    });

    const cleR2Consolide = genererCleDuJour("calendrier-consolide");
    await ecrireJSONDansR2(cleR2Consolide, {
      generatedAt: new Date().toISOString(),
      count: contexteMacro.length,
      data: contexteMacro,
    });

    const archive = await reconstruireArchiveConsolidee();

    return NextResponse.json({
      success: true,
      count: evenements.length,
      nouveaux,
      misAJour,
      cleR2,
      cleR2Consolide,
      archive,
      data: evenements,
      contexteMacro,
    });
  } catch (error) {
    console.error("Erreur scraping calendrier BC :", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
