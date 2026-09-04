// app/api/central-bank-calendar/route.js
//
// FIX ARCHITECTURAL : R2 devient la SEULE source de verite pour
// l'historique du calendrier (via lib/calendrier-archive-r2.js).
//
// FIX PERF (26/08) : maxDuration en filet de securite.
//
// FIX VOLUME #2 (27/08) : construireContexteMacroDuJour() retourne
// desormais { contextePartage, evenements } au lieu d'un tableau plat ou
// chaque evenement recopiait l'integralite du contexte de ses familles
// liees.
//
// FIX CRITIQUE #3 (04/09) : construireContexteMacroDuJour() retourne
// desormais aussi dateCible et dateUtiliseeEnFallback (voir
// lib/macro-consolidator-service.js) — exposes ici dans le fichier R2
// lui-meme, pour voir directement si le repli d'1 jour a ete utilise
// (retard de cron franchissant minuit GMT+3), sans avoir a recalculer
// ou creuser les logs.

import { NextResponse } from "next/server";
import { scraperCalendrierBC } from "../../../lib/central-bank-calendar-service.js";
import Parse from "../../../lib/back4app-server.js";
import { ecrireJSONDansR2, genererCleDuJour } from "../../../lib/r2-client";
import { construireContexteMacroDuJour } from "../../../lib/macro-consolidator-service";
import { fusionnerDansArchiveCalendrier } from "../../../lib/calendrier-archive-r2";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

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

export async function GET() {
  try {
    const evenements = await scraperCalendrierBC();

    const { nouveaux, misAJour } = await upsertVersBack4App(evenements);

    const {
      contextePartage,
      evenements: evenementsAvecContexte,
      dateCible,
      dateUtiliseeEnFallback,
    } = await construireContexteMacroDuJour(evenements);

    const cleR2 = genererCleDuJour("calendrier-bc");
    await ecrireJSONDansR2(cleR2, {
      scrapedAt: new Date().toISOString(),
      count: evenements.length,
      data: evenements,
    });

    const cleR2Consolide = genererCleDuJour("calendrier-consolide");
    await ecrireJSONDansR2(cleR2Consolide, {
      generatedAt: new Date().toISOString(),
      dateCible,
      dateUtiliseeEnFallback,
      count: evenementsAvecContexte.length,
      contextePartage,
      data: evenementsAvecContexte,
    });

    const archive = await fusionnerDansArchiveCalendrier(evenements);

    return NextResponse.json({
      success: true,
      count: evenements.length,
      nouveaux,
      misAJour,
      cleR2,
      cleR2Consolide,
      dateCible,
      dateUtiliseeEnFallback,
      archive,
      data: evenements,
      contexteMacro: evenementsAvecContexte,
    });
  } catch (error) {
    console.error("Erreur scraping calendrier BC :", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
