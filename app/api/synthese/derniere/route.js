// app/api/synthese/derniere/route.js
import { NextResponse } from "next/server";
import { recupererDerniereSynthese } from "../../../../lib/daily-synthesis-service";

export async function GET() {
  try {
    // Priorité à la synthèse quotidienne ; si aucune, on regarde l'hebdo
    let synthese = await recupererDerniereSynthese("quotidien");
    if (!synthese) {
      synthese = await recupererDerniereSynthese("hebdomadaire");
    }

    if (!synthese) {
      return NextResponse.json({ success: false, error: "Aucune synthèse disponible" });
    }

    return NextResponse.json({
      success: true,
      periode: synthese.get("periode"),
      dateTexte: synthese.get("dateTexte"),
      texte: synthese.get("texte"),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
