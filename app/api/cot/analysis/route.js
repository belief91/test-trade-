// app/api/cot/analysis/route.js
//
// FIX : renommé la clé de sortie R2 pour éviter la collision avec
// app/api/cot/analyse/route.js (POST, bouton IA manuel), qui écrit déjà
// sur raw/{date}/cot-analyse.json. Les deux routes sont indépendantes
// (sources différentes, l'une avec IA l'autre sans) mais écrivaient au
// même endroit — l'une écrasait silencieusement l'autre si les deux
// tournaient le même jour.
//
// Route mécanique — AUCUN appel IA ici, uniquement du calcul déterministe
// (même logique que /api/bond-yields/analysis). Utilise la base
// historique COT déjà intégrée dans R2 (alimentée chaque vendredi par
// cot-historique-r2.js).
//
// Sortie désormais : raw/{date}/cot-precalcul.json (distinct de
// cot-analyse.json, réservé à la sortie IA du bouton manuel).

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

    const clePrecalcul = genererCleDuJour("cot-precalcul");
    await ecrireJSONDansR2(clePrecalcul, classifie);

    return Response.json({
      success: true,
      clePrecalcul,
      devisesAnalysees: Object.keys(classifie).length,
      data: classifie,
    });
  } catch (err) {
    console.error("Erreur analyse COT :", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
