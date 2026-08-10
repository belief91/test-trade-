// app/api/central-bank-calendar/route.js
//
// FIX : macro-consolidator-service.js (construireContexteMacroDuJour)
// existait déjà mais n'était jamais appelé ici. Cause confirmée de
// "la nouvelle architecture calendrier par catégories ne fonctionne pas
// dans R2 alors que tous les fichiers ont été poussés sur Git" — le code
// était présent mais jamais branché au flux réel.
//
// Ajout : après l'upsert Back4App, on appelle le consolidateur pour
// construire le contexte macro par famille, puis on écrit un fichier R2
// SUPPLÉMENTAIRE dédié (raw/{date}/calendrier-consolide.json), distinct
// du brut (raw/{date}/calendrier-bc.json). C'est ce fichier consolidé
// que la synthèse IA doit consommer.

import { NextResponse } from "next/server";
import { scraperCalendrierBC } from "../../../lib/central-bank-calendar-service.js";
import Parse from "../../../lib/back4app-server.js";
import { ecrireJSONDansR2, genererCleDuJour, genererCleArchiveDuJour } from "../../../lib/r2-client";
import { construireContexteMacroDuJour } from "../../../lib/macro-consolidator-service";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

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
 * Scrape -> upsert Back4App -> CONSOLIDATION par catégorie/famille macro
 * (macro-consolidator-service.js) -> upload R2. Le consolidateur ne
 * traite que les événements déjà publiés aujourd'hui (reel non vide) ;
 * ceux à venir sont archivés bruts sans contexte macro.
 */
export async function GET() {
  try {
    const evenements = await scraperCalendrierBC();

    const { nouveaux, misAJour } = await upsertVersBack4App(evenements);

    // Consolidation par famille macro (le maillon qui manquait)
    const contexteMacro = await construireContexteMacroDuJour(evenements);

    const cleR2 = genererCleDuJour("calendrier-bc");
    await ecrireJSONDansR2(cleR2, {
      scrapedAt: new Date().toISOString(),
      count: evenements.length,
      data: evenements,
    });

    // Fichier consolidé — même convention raw/{date}/{module}.json,
    // c'est CELUI que la synthèse IA doit consommer, pas le brut ci-dessus
    const cleR2Consolide = genererCleDuJour("calendrier-consolide");
    await ecrireJSONDansR2(cleR2Consolide, {
      generatedAt: new Date().toISOString(),
      count: contexteMacro.length,
      data: contexteMacro,
    });

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
      cleR2Consolide,
      cleArchive,
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
