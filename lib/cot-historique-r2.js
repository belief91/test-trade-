require("dotenv").config({ path: ".env.local" });
// lib/cot-historique-r2.js
// Récupère l'historique COT TFF (2025 → aujourd'hui) et l'upload vers Cloudflare R2
// Format de clé : raw/{date}/cot.json (en GMT+3), identique aux autres modules
// Source : https://publicreporting.cftc.gov/Commitments-of-Traders/TFF-Futures-Only/gpe5-46if

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET_NAME = process.env.R2_BUCKET_NAME;

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

async function fetchHistoriqueCOT(dateDebut = "2025-01-01") {
  const where = Object.values(MARCHES).map(m => `'${m}'`).join(',');
  const url = `${CFTC_BASE_URL}?$where=market_and_exchange_names in(${where}) AND report_date_as_yyyy_mm_dd >= '${dateDebut}'&$order=report_date_as_yyyy_mm_dd ASC&$limit=5000`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur CFTC API: ${res.status} ${res.statusText}`);
  const rows = await res.json();

  const parDevise = {};
  for (const row of rows) {
    const currency = Object.keys(MARCHES).find(k => MARCHES[k] === row.market_and_exchange_names);
    if (!currency) continue;
    if (!parDevise[currency]) parDevise[currency] = [];

    const openInterest = parseInt(row.open_interest_all) || 0;
    parDevise[currency].push({
      reportDate: row.report_date_as_yyyy_mm_dd?.split('T')[0],
      openInterest,
      dealer: calcCategorie(row, CHAMPS.dealer, openInterest),
      assetMgr: calcCategorie(row, CHAMPS.assetMgr, openInterest),
      levMoney: calcCategorie(row, CHAMPS.levMoney, openInterest)
    });
  }

  for (const [devise, lignes] of Object.entries(parDevise)) {
    console.log(`${devise}: ${lignes.length} semaines (du ${lignes[0]?.reportDate} au ${lignes[lignes.length - 1]?.reportDate})`);
  }

  return parDevise;
}

function genererCleR2() {
  const maintenant = new Date();
  const offsetGMT3 = 3 * 60;
  const dateGMT3 = new Date(maintenant.getTime() + (offsetGMT3 + maintenant.getTimezoneOffset()) * 60000);
  const dateStr = dateGMT3.toISOString().split('T')[0];
  return `raw/${dateStr}/cot.json`;
}

async function uploadVersR2(data) {
  const cle = genererCleR2();
  const contenu = JSON.stringify(data, null, 2);

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: cle,
    Body: contenu,
    ContentType: "application/json",
  });

  await r2Client.send(command);
  console.log(`Upload réussi vers R2 : ${cle}`);
  return cle;
}

async function synchroniserHistoriqueCOT(dateDebut = "2025-01-01") {
  const data = await fetchHistoriqueCOT(dateDebut);
  const cle = await uploadVersR2(data);
  return { cle, devises: Object.keys(data).length };
}

module.exports = { fetchHistoriqueCOT, uploadVersR2, synchroniserHistoriqueCOT };

if (require.main === module) {
  synchroniserHistoriqueCOT("2025-01-01")
    .then(result => console.log("\nExtraction + upload terminés:", result))
    .catch(err => console.error("Erreur:", err.message));
}
