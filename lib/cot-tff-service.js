// cot-tff-service.js
// Source officielle : https://publicreporting.cftc.gov/Commitments-of-Traders/TFF-Futures-Only/gpe5-46if
// Dataset Socrata ID : gpe5-46if (TFF Futures Only)
// Champs vérifiés le 09/07/2026 sur données réelles (NZD, AUD) :
//   - Dealer utilise le suffixe "_all"        → dealer_positions_long_all
//   - Asset Mgr et Lev Money n'ont PAS "_all" → asset_mgr_positions_long / lev_money_positions_long

const CFTC_BASE_URL = "https://publicreporting.cftc.gov/resource/gpe5-46if.json";

const MARCHES = {
  "EUR": "EURO FX - CHICAGO MERCANTILE EXCHANGE",
  "GBP": "BRITISH POUND - CHICAGO MERCANTILE EXCHANGE",
  "CAD": "CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE",
  "JPY": "JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE",
  "CHF": "SWISS FRANC - CHICAGO MERCANTILE EXCHANGE",
  "NZD": "NZ DOLLAR - CHICAGO MERCANTILE EXCHANGE",
  "AUD": "AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE"
};

const CHAMPS = {
  dealer:   { long: "dealer_positions_long_all",  short: "dealer_positions_short_all",  spread: "dealer_positions_spread_all" },
  assetMgr: { long: "asset_mgr_positions_long",    short: "asset_mgr_positions_short",    spread: "asset_mgr_positions_spread" },
  levMoney: { long: "lev_money_positions_long",    short: "lev_money_positions_short",    spread: "lev_money_positions_spread" }
};

function calcCategorie(row, champs, openInterest) {
  const long = parseInt(row[champs.long]) || 0;
  const short = parseInt(row[champs.short]) || 0;
  const spread = parseInt(row[champs.spread]) || 0;
  const net = long - short;
  const pctNet = openInterest > 0 ? +(net / openInterest * 100).toFixed(2) : null;
  return { long, short, spread, net, pctNet };
}

async function fetchCOT() {
  const where = Object.values(MARCHES).map(m => `'${m}'`).join(',');
  const url = `${CFTC_BASE_URL}?$where=market_and_exchange_names in(${where})&$order=report_date_as_yyyy_mm_dd DESC&$limit=140`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur CFTC API: ${res.status} ${res.statusText}`);
  const rows = await res.json();

  const dernierParDevise = {};
  for (const row of rows) {
    const currency = Object.keys(MARCHES).find(k => MARCHES[k] === row.market_and_exchange_names);
    if (!currency) continue;
    if (!dernierParDevise[currency]) dernierParDevise[currency] = row;
  }

  const manquantes = Object.keys(MARCHES).filter(c => !dernierParDevise[c]);
  if (manquantes.length > 0) console.warn(`Devises absentes: ${manquantes.join(', ')}`);

  return Object.entries(dernierParDevise).map(([currency, row]) => {
    const openInterest = parseInt(row.open_interest_all) || 0;
    return {
      currency,
      reportDate: row.report_date_as_yyyy_mm_dd?.split('T')[0],
      openInterest,
      dealer: calcCategorie(row, CHAMPS.dealer, openInterest),
      assetMgr: calcCategorie(row, CHAMPS.assetMgr, openInterest),
      levMoney: calcCategorie(row, CHAMPS.levMoney, openInterest)
    };
  });
}

module.exports = { fetchCOT };
