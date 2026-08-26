// app/api/central-bank-calendar/route.js
//
// FIX ARCHITECTURAL : R2 devient la SEULE source de verite pour
// l'historique du calendrier (via lib/calendrier-archive-r2.js). Back4App
// CentralBankCalendar garde un role reduit : permettre a
// reconnaissance-service.js de detecter les evenements bancaires DU JOUR.
// N'est plus jamais interroge comme entrepot historique croissant.
//
// FIX PERF (26/08) : ajout de maxDuration en filet de securite. La cause
// principale du blocage (lecture R2 repetee dans macro-consolidator-
// service.js) est corrigee separement, mais cette route reste la plus
// lourde du projet (scraping + boucle Back4App sequentielle + contexte
// macro) et n'avait aucune limite explicite — elle heritait donc du
// defaut du plan Vercel, jamais verifie. 60s aligne avec la limite deja
// posee sur app/api/geopolitics-news/route.js.

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

    const archive = await fusionnerDansArchiveCalendrier(evenements);

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
