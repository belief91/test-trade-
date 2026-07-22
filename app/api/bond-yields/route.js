import { NextResponse } from "next/server";
import { scraperMaturitesG10 } from "../../../lib/bond-yield-maturities-service.js";
import Parse from "../../../lib/back4app-server.js";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

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

export async function GET() {
  try {
    const yields = await scraperMaturitesG10();
    await sauvegarderVersBack4App(yields);

    return NextResponse.json({
      success: true,
      count: yields.length,
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