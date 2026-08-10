// app/api/cron/synthese-quotidienne/route.js
// FIX : ajout du garde-fou SYNTHESE_SUSPENDUE, absent du code original.
// C'est ce qui explique la consommation de crédits IA malgré la demande
// de suspension : rien dans le code ne vérifiait ce flag jusqu'ici.
//
// ACTION MANUELLE REQUISE : ajouter SYNTHESE_SUSPENDUE=true dans
// Vercel > Settings > Environment Variables (Production) pour que ce
// fix prenne effet.

import { NextResponse } from "next/server";
import { genererSynthese } from "../../../../lib/ai-synthesis-service";
import { enregistrerSynthese } from "../../../../lib/daily-synthesis-service";

export const maxDuration = 60;

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
    const texte = await genererSynthese({ periode: "quotidien" });
    const saved = await enregistrerSynthese("quotidien", texte);
    return NextResponse.json({ success: true, texte: saved.get("texte") });
  } catch (error) {
    console.error("Erreur synthèse quotidienne :", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
