import { NextResponse } from "next/server";
import { scraperMaturitesG10 } from "../../../lib/bond-yield-maturities-service.js";
import Parse from "../../../lib/back4app-server.js";
import { ecrireJSONDansR2, genererCleDuJour } from "../../../lib/r2-client";

// Empêche Next.js de mettre en cache les requêtes internes (fetch) de
// cette route — sans ça, les query.find() vers Parse peuvent renvoyer
// une réponse périmée mise en cache par le Data Cache de Next.js.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// FIX (01/09) : cette route n'avait aucun maxDuration, contrairement à
// bond-yields/analysis et cot/analysis déjà corrigés le 28/08 pour le
// même type de bug. Confirmé sur R2 : bond-yield-analysis.json et
// cot-precalcul.json manquent presque systématiquement le lundi.
// Hypothèse retenue (pas 100% prouvée, mais cohérente avec les deux
// observations) : GitHub Actions a des délais de file d'attente connus
// et documentés plus importants le lundi (pic de charge globale sur les
// runners partagés) — un déclenchement retardé de CE scraper (17h00
// UTC) combiné à l'absence de maxDuration augmente la probabilité de
// dépasser la limite par défaut de Vercel Hobby ce jour-là précisément.
// bond-yields/analysis (17h15 UTC) dépend des données Back4App écrites
// ICI — si ce scraper échoue silencieusement le lundi, l'analyse qui
// suit 15 minutes plus tard n'a rien de neuf à analyser non plus.
export const maxDuration = 60;

/**
 * Sauvegarde les yields dans Back4App, classe "BondYieldMaturity".
 */
async function sauvegarderVersBack4App(yields) {
  const BondYieldMaturity = Parse.Object.extend("BondYieldMaturity");

  const query = new Parse.Query(BondYieldMaturity);
  query.containedIn(
    "currency",
    yields.map((y) => y.currency)
  );
  query.limit(1000);
  const existants = await query.find({ useMasterKey: true });

  const trouverExistant = (currency, maturity) =>
    existants.find((o) => o.get("currency") === currency && o.get("maturity") === maturity);

  const objets = yields.map((y) => {
    const obj = trouverExistant(y.currency, y.maturity) || new BondYieldMaturity();
    obj.set("currency", y.currency);
    obj.set("country", y.country);
    obj.set("maturity", y.maturity);
    obj.set("label", y.label);
    obj.set("yieldValue", y.yield);
    obj.set("dayChgPercent", y.dayChgPercent);
    obj.set("monthChgPercent", y.monthChgPercent);
    obj.set("yearChgPercent", y.yearChgPercent);
    obj.set("dateLabel", y.date);
    obj.set("scrapedAt", new Date(y.scrapedAt));
    return obj;
  });

  return Parse.Object.saveAll(objets, { useMasterKey: true });
}

/**
 * GET /api/bond-yields
 *
 * Scrape les yields 2Y/5Y/10Y pour les 8 devises G10 depuis
 * TradingEconomics, et les sauvegarde dans Back4App.
 */
export async function GET() {
  try {
    const yields = await scraperMaturitesG10();

    await sauvegarderVersBack4App(yields);

    const cleR2 = genererCleDuJour("bond-yields");
    await ecrireJSONDansR2(cleR2, {
      scrapedAt: new Date().toISOString(),
      count: yields.length,
      data: yields,
    });

    return NextResponse.json({
      success: true,
      count: yields.length,
      cleR2,
      data: yields,
    });
  } catch (error) {
    console.error("Erreur scraping bond yields :", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
