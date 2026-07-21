import { NextResponse } from "next/server";
import { scraperMaturitesG10 } from "../../../lib/bond-yield-maturities-service.js";
import Parse from "../../../lib/back4app-server.js";

// Empêche Next.js de mettre en cache les requêtes internes (fetch) de
// cette route — sans ça, les query.find() vers Parse peuvent renvoyer
// une réponse périmée mise en cache par le Data Cache de Next.js.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Sauvegarde les yields dans Back4App, classe "BondYieldMaturity".
 * Utilise saveAll pour les enregistrer en une seule opération batch,
 * même pattern que sauvegarderVersBack4App() dans route.js calendar.
 *
 * ⚠️ Contrairement au calendar (toujours de nouveaux événements),
 * ici on veut un "snapshot" : un seul document par (currency, maturity),
 * mis à jour à chaque scraping plutôt que dupliqué. saveAll ne fait pas
 * d'upsert automatique, donc on cherche d'abord les objets existants.
 *
 * ⚠️ Suppose une classe Parse "BondYieldMaturity" (créée automatiquement
 * par Parse au premier save si le schéma Back4App n'est pas verrouillé).
 */
async function sauvegarderVersBack4App(yields) {
  const BondYieldMaturity = Parse.Object.extend("BondYieldMaturity");

  // Récupère les objets existants pour les 8 devises en une seule requête,
  // plutôt qu'une query par ligne (24 requêtes) — reste efficace.
  const query = new Parse.Query(BondYieldMaturity);
  query.containedIn(
    "currency",
    yields.map((y) => y.currency)
  );
  query.limit(1000);
  // LOGS TEMPORAIRES DE DIAGNOSTIC (niveau 2) — isoler la cause
  const totalSansFiltre = await new Parse.Query(BondYieldMaturity).count({ useMasterKey: true });
  console.log(`[DEBUG] Total objets dans la classe (SANS filtre currency): ${totalSansFiltre}`);

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
