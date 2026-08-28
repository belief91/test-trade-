import { NextResponse } from "next/server";
import Parse from "../../../../lib/back4app-server.js";
import { analyserCourbesDeTaux } from "../../../../lib/bond-yield-curve-analysis.js";
import { uploaderVersR2 } from "../../../../lib/r2-upload-service.js";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

/**
 * Retourne la date du jour en GMT+3 (Madagascar), format YYYY-MM-DD.
 */
function getDateGMT3() {
  const now = new Date();
  const gmt3 = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return gmt3.toISOString().slice(0, 10); // "2026-07-22"
}

/**
 * Lit les données actuelles de BondYieldMaturity depuis Back4App.
 */
async function lireBondYieldsBack4App() {
  const BondYieldMaturity = Parse.Object.extend("BondYieldMaturity");
  const query = new Parse.Query(BondYieldMaturity);
  query.limit(1000);
  const objets = await query.find({ useMasterKey: true });

  return objets.map((o) => ({
    currency: o.get("currency"),
    country: o.get("country"),
    maturity: o.get("maturity"),
    yield: o.get("yieldValue"),
    dayChgPercent: o.get("dayChgPercent"),
    monthChgPercent: o.get("monthChgPercent"),
    yearChgPercent: o.get("yearChgPercent"),
    date: o.get("dateLabel"),
    scrapedAt: o.get("scrapedAt"),
  }));
}

/**
 * GET /api/bond-yields/analysis
 *
 * Appelée par le cron automatique (20h15 GMT+3, voir cron-beliefx.yml,
 * job bond-yields-analysis) — le commentaire précédent affirmant "pas
 * par le cron automatique" était obsolète, corrigé au passage (28/08).
 *
 * Flux :
 *   1. Lit BondYieldMaturity depuis Back4App (données déjà scrapées)
 *   2. Calcule spreads / forme de courbe / cohérence FX
 *   3. Upload le JSON vers R2 : raw/{date}/bond-yield-analysis.json
 *   4. Retourne le résultat pour confirmation immédiate
 *
 * FIX (28/08) : ajout de maxDuration, absent jusqu'ici — même classe de
 * bug que cot/analysis (voir ce fichier, corrigé le même jour). Confirmé
 * sur R2 : bond-yield-analysis.json absent le 27/08, présent le 25 et
 * le 28 — échec intermittent typique d'un timeout par défaut trop court.
 */
export async function GET() {
  try {
    // 1. Lecture Back4App
    const yields = await lireBondYieldsBack4App();

    if (yields.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Aucune donnée dans BondYieldMaturity — lance d'abord /api/bond-yields pour scraper.",
        },
        { status: 400 }
      );
    }

    // 2. Calculs déterministes
    const analyse = analyserCourbesDeTaux(yields);

    // 3. Upload vers R2
    const date = getDateGMT3();
    const cleR2 = `raw/${date}/bond-yield-analysis.json`;
    await uploaderVersR2(cleR2, JSON.stringify(analyse, null, 2));

    // 4. Réponse
    return NextResponse.json({
      success: true,
      cleR2,
      devisesAnalysees: analyse.resultats.length,
      devisesIgnorees: analyse.devisesIgnorees,
      data: analyse.resultats,
    });
  } catch (error) {
    console.error("Erreur analyse bond yields :", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
