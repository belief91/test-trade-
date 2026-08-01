// app/api/cron/synthese-hebdo/route.js
import { NextResponse } from "next/server";
import { genererSyntheseHebdomadaire } from "../../../../lib/ai-synthesis-service";
import {
  enregistrerSynthese,
  recupererSynthesesRecentes,
} from "../../../../lib/daily-synthesis-service";

export const maxDuration = 60;

export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const synthesesQuotidiennes = await recupererSynthesesRecentes(6);

    if (synthesesQuotidiennes.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Aucune synthèse quotidienne trouvée cette semaine",
      });
    }

    const texte = await genererSyntheseHebdomadaire(synthesesQuotidiennes);
    const saved = await enregistrerSynthese("hebdomadaire", texte);
    return NextResponse.json({ success: true, texte: saved.get("texte") });
  } catch (error) {
    console.error("Erreur synthèse hebdomadaire :", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
