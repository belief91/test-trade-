// app/api/cron/synthese-quotidienne/route.js
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

  try {
    const texte = await genererSynthese({ periode: "quotidien" });
    const saved = await enregistrerSynthese("quotidien", texte);
    return NextResponse.json({ success: true, texte: saved.get("texte") });
  } catch (error) {
    console.error("Erreur synthèse quotidienne :", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
