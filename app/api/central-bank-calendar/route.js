// app/api/central-bank-calendar/route.js
//
// FIX ARCHITECTURAL : R2 devient la SEULE source de verite pour
// l'historique du calendrier (via lib/calendrier-archive-r2.js).
//
// FIX PERF (26/08) : maxDuration en filet de securite.
//
// FIX CRITIQUE #4 (05/09) : construireContexteMacroDuJour() retourne
// desormais clesTraitees au lieu de dateCible/dateUtiliseeEnFallback
// (toute logique basee sur l'horloge a ete abandonnee, voir
// lib/macro-consolidator-service.js). Ces cles sont enregistrees ICI,
// APRES confirmation que l'ecriture R2 du fichier consolide a reussi —
// jamais avant, pour ne pas marquer un evenement comme "traite" si la
// sauvegarde a echoue (auquel cas il redeviendra eligible au prochain
// run, comportement voulu).

import { NextResponse } from "next/server";
import { scraperCalendrierBC } from "../../../lib/central-bank-calendar-service.js";
import Parse from "../../../lib/back4app-server.js";
import { ecrireJSONDansR2, genererCleDuJour } from "../../../lib/r2-client";
import { construireContexteMacroDuJour } from "../../../lib/macro-consolidator-service";
import { fusionnerDansArchiveCalendrier, enregistrerEvenementsTraites } from "../../../lib/calendrier-archive-r2";

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
      clesTraitees,
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
      count: evenementsAvecContexte.length,
      contextePartage,
      data: evenementsAvecContexte,
    });

    // FIX CRITIQUE #4 (05/09) : enregistré seulement APRÈS confirmation
    // que l'écriture ci-dessus a réussi (aucune exception levée avant
    // ce point). Si l'écriture R2 avait échoué, on ne serait jamais
    // arrivé ici — les événements resteraient éligibles au run suivant.
    await enregistrerEvenementsTraites(clesTraitees);

    const archive = await fusionnerDansArchiveCalendrier(evenements);

    return NextResponse.json({
      success: true,
      count: evenements.length,
      nouveaux,
      misAJour,
      cleR2,
      cleR2Consolide,
      clesTraiteesCeRun: clesTraitees,
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
