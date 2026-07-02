import Parse from "./back4app";

const Trade = Parse.Object.extend("Trade");

function toPlain(obj) {
  return { ...obj.toJSON(), id: obj.id };
}

/**
 * Garde la même signature que la version Firebase (callback + unsubscribe)
 * pour ne rien changer dans les composants. Parse n'a pas d'écoute temps
 * réel native côté client gratuit — on fait donc une lecture unique ;
 * les composants se rafraîchissent déjà via leur `refreshKey` après
 * chaque création/suppression.
 */
export function listenToTrades(callback) {
  const query = new Parse.Query(Trade);
  query.descending("date");
  query.limit(1000);
  query.find().then((results) => callback(results.map(toPlain)));
  return () => {};
}

export async function createTrade(data) {
  const trade = new Trade();
  Object.entries(data).forEach(([k, v]) => trade.set(k, v));
  await trade.save();
  return { id: trade.id };
}

export async function updateTrade(id, data) {
  const trade = new Trade();
  trade.id = id;
  Object.entries(data).forEach(([k, v]) => trade.set(k, v));
  return trade.save();
}

export async function deleteTrade(id) {
  const trade = new Trade();
  trade.id = id;
  return trade.destroy();
}

export async function bulkCreateTrades(tradesArray) {
  const objects = tradesArray.map((data) => {
    const t = new Trade();
    Object.entries(data).forEach(([k, v]) => t.set(k, v));
    return t;
  });
  await Parse.Object.saveAll(objects);
  return objects.length;
}

export function computeResultFromPrices({ direction, entry, exit }) {
  const e = parseFloat(entry);
  const x = parseFloat(exit);
  if (Number.isNaN(e) || Number.isNaN(x) || e === 0) return null;
  const variation = direction === "short" ? e - x : x - e;
  const pct = (variation / e) * 100;
  return { variation, pct };
}

export function resultFromPL(profitLoss) {
  if (profitLoss == null || Number.isNaN(profitLoss)) return null;
  if (profitLoss > 0) return "Win";
  if (profitLoss < 0) return "Loss";
  return "Breakeven";
}
