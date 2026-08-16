// app/api/central-bank-calendar/route.js
//
// FIX : remplace l'archive quotidienne (database/calendrier-bc/{date}.json,
// un nouveau fichier chaque jour, chacun redupliquant presque toute la
// semaine scrapée) par UN SEUL fichier consolidé, mis à jour en continu
// (fusion + dédoublonnage sur devise+evenement+date), jamais réécrit
// depuis zéro. Élimine la croissance inutile du bucket R2 et les
// opérations d'écriture redondantes.

import { NextResponse } from "next/server";
import { scraperCalendrierBC } from "../../../lib/central-bank-calendar-service.js";
import Parse from "../../../lib/back4app-server.js";
import { ecrireJSONDansR2, lireJSONDepuisR2, genererCleDuJour } from "../../../lib/r2-client";
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

/**
 * Fusionne les événements de la semaine scrapée aujourd'hui dans
 * l'archive consolidée unique, sans jamais créer de nouveau fichier daté.
 * Dédoublonnage sur (devise+evenement+date) — un événement déjà présent
 * est remplacé (ex: "reel" qui passe de vide à une vraie valeur une fois
 * publié), jamais dupliqué.
 */
async function fusionnerDansArchiveConsolidee(evenements) {
  let archiveExistante = [];
  try {
    const existant = await lireJSONDepuisR2(CLE_ARCHIVE_CONSOLIDEE);
    archiveExistante = existant.data || [];
  } catch {
    archiveExistante = []; // première exécution — pas encore de fichier
  }

  const parCle = new Map();
  for (const e of archiveExistante) {
    parCle.set(`${e.devise}|${e.evenement}|${e.date}`, e);
  }
  for (const e of evenements) {
    parCle.set(`${e.devise}|${e.evenement}|${e.date}`, e);
  }

  const fusionnes = Array.from(parCle.values()).sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  await ecrireJSONDansR2(CLE_ARCHIVE_CONSOLIDEE, {
    updatedAt: new Date().toISOString(),
    count: fusionnes.length,
    data: fusionnes,
  });

  return { cle: CLE_ARCHIVE_CONSOLIDEE, count: fusionnes.length };
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

    // FIX : archive consolidée unique, fusionnée — remplace l'ancienne
    // écriture quotidienne (genererCleArchiveDuJour), qui créait un
    // nouveau fichier daté chaque jour au lieu de fusionner.
    const archive = await fusionnerDansArchiveConsolidee(evenements);

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
