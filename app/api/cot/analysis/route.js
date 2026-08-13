// app/api/cot/analysis/route.js
//
// Route mécanique — AUCUN appel IA ici, uniquement du calcul déterministe
// (même logique que /api/bond-yields/analysis). Utilise la base
// historique COT déjà intégrée dans R2 (alimentée chaque vendredi par
// cot-historique-r2.js) — pas besoin d'écrire de snapshot brut séparé.
//
// Nom de clé aligné sur la convention déjà en place dans R2 (confirmé
// par raw/2026-08-03/cot-analyse.json) : "cot-analyse", pas "cot-analytics".

import { fetchHistoriqueCOT } from "../../../../lib/cot-historique-r2";
import { calculerAnalyticsToutesDevises } from "../../../../lib/cot-analytics";
import { classifierCOT } from "../../../../lib/cot-classification";
import { ecrireJSONDansR2, genererCleDuJour } from "../../../../lib/r2-client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - 110 * 7); // ~110 semaines, couvre 104S + marge Δ13S
    const dateDebutStr = dateDebut.toISOString().split("T")[0];

    const parDevise = await fetchHistoriqueCOT(dateDebutStr);
    const analytics = calculerAnalyticsToutesDevises(parDevise);

    const classifie = {};
    for (const [devise, analyse] of Object.entries(analytics)) {
      classifie[devise] = classifierCOT(analyse);
    }

    const cleAnalyse = genererCleDuJour("cot-analyse");
    await ecrireJSONDansR2(cleAnalyse, classifie);

    return Response.json({
      success: true,
      cleAnalyse,
      devisesAnalysees: Object.keys(classifie).length,
      data: classifie,
    });
  } catch (err) {
    console.error("Erreur analyse COT :", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
