// app/api/cron/synthese-quotidienne/route.js
//
// FIX (10/09) : appelle genererToutesLesSynthesesModulaires() (5 prompts
// séparés) PUIS genererSyntheseFusion() (fusion automatique par devise),
// qui enregistre le résultat final dans DailySynthesis — le même point
// que lit le dashboard, que la donnée vienne de cette route automatique
// ou du copier-coller manuel (méthode gratuite, voir
// categorisation-reponse-service.js).
//
// maxDuration relevé à 120s : la fusion ajoute jusqu'à 8 appels IA
// supplémentaires (un par devise) après les 5 modules — à vérifier que
// ton plan Vercel autorise cette durée pour les cron jobs.

import { NextResponse } from "next/server";
import { genererToutesLesSynthesesModulaires } from "../../../../lib/module-synthesis-service";
import { genererSyntheseFusion } from "../../../../lib/fusion-service";

export const maxDuration = 120;

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

    const rapportModules = await genererToutesLesSynthesesModulaires(dateStr);
    const rapportFusion = await genererSyntheseFusion(dateStr);

    return NextResponse.json({
      success: true,
      dateStr,
      modules: rapportModules.resultats,
      fusion: rapportFusion,
    });
  } catch (error) {
    console.error("Erreur synthèse quotidienne :", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
