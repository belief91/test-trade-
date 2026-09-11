// app/api/cron/synthese-quotidienne/route.js
//
// FIX (10/09) : remplace l'appel à genererSynthese() (prompt unique
// combiné, sans géopo) par genererToutesLesSynthesesModulaires() (les
// 5 prompts séparés : COT, taux, macro, géopo, BC en mode dégradé).
//
// L'appel à enregistrerSynthese() est retiré volontairement : le prompt
// de fusion journalière (qui produirait le texte combiné à afficher)
// n'est pas encore branché ni testé. Ce cron se contente donc de générer
// et stocker les 5 synthèses modulaires (synthese/{module}/{date}.json
// via ecrireSynthese, déjà appelé à l'intérieur de chaque générateur).
// DailySynthesis ("quotidien") n'est plus mis à jour par cette route
// tant que la fusion n'est pas câblée — éviter d'y écrire un texte vide
// ou inventé est préférable à un affichage qui semblerait à jour sans
// l'être.

import { NextResponse } from "next/server";
import { genererToutesLesSynthesesModulaires } from "../../../../lib/module-synthesis-service";

export const maxDuration = 60;

function dateDuJourGMT3() {
  const maintenant = new Date();
  const offsetGMT3 = 3 * 60;
  const dateGMT3 = new Date(maintenant.getTime() + (offsetGMT3 + maintenant.getTimezoneOffset()) * 60000);
  return dateGMT3.toISOString().split("T")[0];
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.SYNTHESE_SUSPENDUE === "true") {
    return NextResponse.json({
      success: false,
      suspendu: true,
      message: "Synthèse automatique suspendue (SYNTHESE_SUSPENDUE=true)",
    });
  }

  try {
    const dateStr = dateDuJourGMT3();
    const rapport = await genererToutesLesSynthesesModulaires(dateStr);
    return NextResponse.json({ success: true, dateStr, ...rapport });
  } catch (error) {
    console.error("Erreur synthèse quotidienne :", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
