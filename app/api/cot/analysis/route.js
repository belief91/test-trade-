// app/api/cot/analysis/route.js
//
// FIX : renommé la clé de sortie R2 pour éviter la collision avec
// app/api/cot/analyse/route.js (POST, bouton IA manuel), qui écrit déjà
// sur raw/{date}/cot-analyse.json.
//
// Route mécanique — AUCUN appel IA ici, uniquement du calcul déterministe.
// Utilise la base historique COT déjà intégrée dans R2.
//
// Sortie désormais : raw/{date}/cot-precalcul.json.
//
// FIX (28/08) : ajout de maxDuration, absent jusqu'ici — contrairement
// aux autres routes du projet déjà corrigées. fetchHistoriqueCOT() fait
// un appel réseau vers l'API publique CFTC (gouvernement US, notoirement
// lente par moments) ; sans maxDuration explicite, la route héritait de
// la limite par défaut Vercel et pouvait timeout silencieusement un jour
// où cet appel externe traîne — confirmé : cot-precalcul.json absent de
// R2 le 27/08, présent le 25 et le 28. Ce n'est pas un bug de logique,
// juste l'absence du même filet de sécurité déjà posé ailleurs.

import { fetchHistoriqueCOT } from "../../../../lib/cot-historique-r2";
import { calculerAnalyticsToutesDevises } from "../../../../lib/cot-analytics";
import { classifierCOT } from "../../../../lib/cot-classification";
import { ecrireJSONDansR2, genererCleDuJour } from "../../../../lib/r2-client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

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
