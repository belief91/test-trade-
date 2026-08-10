// app/api/cron/synthese-quotidienne/route.js
import { NextResponse } from "next/server";
import { genererSynthese } from "../../../../lib/ai-synthesis-service";
import { enregistrerSynthese } from "../../../../lib/daily-synthesis-service";

export const maxDuration = 60;

/**
 * GET /api/cron/synthese-quotidienne
 * 
 * Route protégée par CRON_SECRET pour la synthèse quotidienne automatique.
 * 
 * NOTE IMPORTANTE : Cette route doit être activée uniquement lorsque
 * l'IA est prête à être utilisée. Pour suspendre la synthèse automatique,
 * commenter l'appel à genererSynthese() ci-dessous.
 */
export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // SUSPENDU TEMPORAIREMENT - Décommenter pour réactiver la synthèse automatique
    // const texte = await genererSynthese({ periode: "quotidien" });
    // const saved = await enregistrerSynthese("quotidien", texte);
    
    return NextResponse.json({ 
      success: false, 
      message: "Synthèse IA suspendue temporairement sur demande utilisateur" 
    });
  } catch (error) {
    console.error("Erreur synthèse quotidienne :", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
