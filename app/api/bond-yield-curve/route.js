import { NextResponse } from "next/server";
import { scraperCourbeDeTaux } from "../../../lib/bond-yield-curve-service.js";
import Parse from "../../../lib/back4app-server.js";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function sauvegarderVersBack4App(items) {
  const BondYieldCurve = Parse.Object.extend("BondYieldCurve");

  const symbols = items.map((i) => i.symbol).filter(Boolean);
  const query = new Parse.Query(BondYieldCurve);
  query.containedIn("symbol", symbols);
  query.limit(1000);
  const existants = await query.find({ useMasterKey: true });

  const trouverExistant = (symbol) => existants.find((o) => o.get("symbol") === symbol);

  const objets = items
    .filter((i) => i.symbol)
    .map((i) => {
      const obj = trouverExistant(i.symbol) || new BondYieldCurve();
      obj.set("symbol", i.symbol);
      obj.set("country", i.country);
      obj.set("region", i.region);
      obj.set("url", i.url);
      obj.set("yieldValue", i.yield);
      obj.set("chgDaily", i.chgDaily);
      obj.set("weekly", i.weekly);
      obj.set("monthly", i.monthly);
      obj.set("ytd", i.ytd);
      obj.set("yoy", i.yoy);
      obj.set("dateLabel", i.date);
      obj.set("scrapedAt", new Date(i.scrapedAt));
      return obj;
    });

  return Parse.Object.saveAll(objets, { useMasterKey: true });
}

export async function GET() {
  try {
    const items = await scraperCourbeDeTaux();
    await sauvegarderVersBack4App(items);

    return NextResponse.json({
      success: true,
      count: items.length,
      data: items,
    });
  } catch (error) {
    console.error("Erreur scraping courbe de taux :", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}