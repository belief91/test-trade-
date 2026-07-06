import Parse from "./back4app";
import { updateTrade } from "./trades";

const ScreenshotEntry = Parse.Object.extend("ScreenshotEntry");
const LIMIT = 80;

// Correspondance entre le vocabulaire du module Screenshots (WIN/SL/BE) et
// celui du Journal (Win/Loss/Breakeven) — même concept, deux façons de l'écrire.
const RESULT_TO_TRADE = { WIN: "Win", SL: "Loss", BE: "Breakeven" };

function toPlain(obj) {
  return { ...obj.toJSON(), id: obj.id };
}

export function listenToScreenshotEntries(callback) {
  const query = new Parse.Query(ScreenshotEntry);
  query.descending("createdAt");
  query.limit(200);
  query.find().then((results) => callback(results.map(toPlain)));
  return () => {};
}

export async function createScreenshotEntry({ date, label, avantUrl }) {
  const entry = new ScreenshotEntry();
  entry.set("date", date || new Date().toISOString().slice(0, 10));
  entry.set("label", label || "");
  entry.set("avantUrl", avantUrl || null);
  entry.set("apresUrl", null);
  entry.set("linkedTradeId", null);
  entry.set("resultat", null);
  entry.set("beDetail", "");
  await entry.save();
  if (avantUrl) await enforceScreenshotLimit();
  return { id: entry.id };
}

/**
 * Lie une entrée à un trade précis du Journal (par son id, jamais juste par
 * paire — voir explication donnée à l'utilisateur : lier seulement par paire
 * serait ambigu s'il existe plusieurs trades sur la même paire).
 */
export async function linkEntryToTrade(entryId, tradeId) {
  const entry = new ScreenshotEntry();
  entry.id = entryId;
  entry.set("linkedTradeId", tradeId || null);
  return entry.save();
}

/**
 * Met à jour le résultat (WIN/SL/BE + détail BE) d'une entrée. Si l'entrée
 * est liée à un trade précis, répercute aussi ce résultat sur ce trade —
 * synchronisation explicite, jamais automatique par simple correspondance
 * de paire.
 */
export async function setEntryResult(entryId, linkedTradeId, resultat, beDetail = "") {
  const entry = new ScreenshotEntry();
  entry.id = entryId;
  entry.set("resultat", resultat);
  entry.set("beDetail", resultat === "BE" ? beDetail : "");
  await entry.save();

  if (linkedTradeId && resultat && RESULT_TO_TRADE[resultat]) {
    await updateTrade(linkedTradeId, { result: RESULT_TO_TRADE[resultat] });
  }
}

export async function uploadToSlot(file, entryId, slot) {
  const parseFile = new Parse.File(`${slot}-${entryId}-${Date.now()}.jpg`, file);
  await parseFile.save();
  const entry = new ScreenshotEntry();
  entry.id = entryId;
  entry.set(slot === "avant" ? "avantUrl" : "apresUrl", parseFile.url());
  entry.set(slot === "avant" ? "avantPath" : "apresPath", parseFile.name());
  await entry.save();
  await enforceScreenshotLimit();
  return { url: parseFile.url(), path: parseFile.name() };
}

/**
 * Retire une seule capture (avant OU après) d'une paire — décision manuelle
 * uniquement, jamais automatique. L'entrée reste visible même incomplète.
 */
export async function clearSlot(entryId, slot) {
  const entry = new ScreenshotEntry();
  entry.id = entryId;
  entry.set(slot === "avant" ? "avantUrl" : "apresUrl", null);
  entry.set(slot === "avant" ? "avantPath" : "apresPath", null);
  return entry.save();
}

/** Supprime l'entrée entière (les deux slots), décision manuelle. */
export async function deleteEntry(entryId) {
  const entry = new ScreenshotEntry();
  entry.id = entryId;
  return entry.destroy();
}

async function countTotal() {
  const q1 = new Parse.Query(ScreenshotEntry);
  q1.exists("avantUrl");
  const withAvant = await q1.count();
  const q2 = new Parse.Query(ScreenshotEntry);
  q2.exists("apresUrl");
  const withApres = await q2.count();
  return withAvant + withApres;
}

/**
 * Si le total dépasse 80, évince les paires les plus anciennes — mais
 * UNIQUEMENT les paires complètes (avant ET après remplis). Une entrée
 * incomplète (un seul des deux slots rempli), même vieille de plusieurs
 * semaines, n'est jamais touchée automatiquement — décision manuelle requise.
 */
export async function enforceScreenshotLimit() {
  const total = await countTotal();
  if (total <= LIMIT) return;

  const query = new Parse.Query(ScreenshotEntry);
  query.exists("avantUrl");
  query.exists("apresUrl");
  query.ascending("createdAt");
  query.limit(50);
  const completePairs = await query.find();

  let toRemove = total - LIMIT;
  for (const e of completePairs) {
    if (toRemove <= 0) break;
    e.set("avantUrl", null);
    e.set("avantPath", null);
    e.set("apresUrl", null);
    e.set("apresPath", null);
    await e.save();
    toRemove -= 2;
  }
}
