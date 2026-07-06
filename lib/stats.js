/**
 * Toutes les dates sont comparées en chaîne "YYYY-MM-DD" pour éviter
 * les soucis de fuseau horaire — on ne convertit jamais trade.date en objet Date
 * pour les comparaisons, on compare directement les chaînes triables.
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toYMD(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Lundi de la semaine contenant `date` */
function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day; // recule jusqu'au lundi
  d.setDate(d.getDate() + diff);
  return d;
}

export function getPeriodRanges(now = new Date()) {
  const today = toYMD(now);
  const weekStart = toYMD(startOfWeek(now));
  const monthStart = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;

  return {
    today: { from: today, to: today },
    week: { from: weekStart, to: today },
    month: { from: monthStart, to: today },
  };
}

function inRange(dateStr, range) {
  return dateStr >= range.from && dateStr <= range.to;
}

/**
 * Calcule les stats d'un ensemble de trades : win rate (basé sur `result`,
 * indépendant de l'unité $ ou %), P&L cumulé en $ (trades manuels uniquement),
 * et rendement moyen en % (trades basés sur le prix uniquement).
 */
export function computeStats(trades) {
  const total = trades.length;
  const wins = trades.filter((t) => t.result === "Win").length;
  const losses = trades.filter((t) => t.result === "Loss").length;
  const breakeven = trades.filter((t) => t.result === "Breakeven").length;
  const winRate = total > 0 ? (wins / total) * 100 : null;

  const manuels = trades.filter((t) => t.isManualResult && t.profitLoss != null);
  const totalPL = manuels.length > 0
    ? manuels.reduce((sum, t) => sum + t.profitLoss, 0)
    : null;

  const prixBases = trades.filter((t) => !t.isManualResult && t.profitLoss != null);
  const avgPct = prixBases.length > 0
    ? prixBases.reduce((sum, t) => sum + t.profitLoss, 0) / prixBases.length
    : null;

  const rrTrades = trades.filter((t) => t.riskReward != null);
  const avgRR = rrTrades.length > 0
    ? rrTrades.reduce((sum, t) => sum + t.riskReward, 0) / rrTrades.length
    : null;

  return { total, wins, losses, breakeven, winRate, totalPL, avgPct, avgRR };
}

/** Filtre les trades dont la date tombe dans une période donnée, puis calcule les stats. */
export function statsForPeriod(trades, range) {
  const filtered = trades.filter((t) => t.date && inRange(t.date, range));
  return computeStats(filtered);
}

/**
 * Regroupe les trades par champ donné ("paire" ou "setup") et calcule
 * le win rate + nombre de trades pour chaque valeur. Trié par win rate décroissant,
 * en ignorant les valeurs vides.
 */
export function groupedWinRate(trades, field) {
  const groups = {};
  trades.forEach((t) => {
    const key = (t[field] || "").trim();
    if (!key) return;
    if (!groups[key]) groups[key] = { key, total: 0, wins: 0, losses: 0 };
    groups[key].total += 1;
    if (t.result === "Win") groups[key].wins += 1;
    if (t.result === "Loss") groups[key].losses += 1;
  });
  return Object.values(groups)
    .map((g) => ({ ...g, winRate: g.total > 0 ? (g.wins / g.total) * 100 : 0 }))
    .sort((a, b) => b.winRate - a.winRate || b.total - a.total);
}

/**
 * Calcule la série en cours (win ou loss) à partir des trades les plus récents,
 * triés par date. S'arrête au premier Breakeven ou à l'inversion du résultat.
 */
export function currentStreak(trades) {
  const sorted = [...trades]
    .filter((t) => t.date && (t.result === "Win" || t.result === "Loss"))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  if (sorted.length === 0) return { type: null, count: 0 };

  const type = sorted[0].result;
  let count = 0;
  for (const t of sorted) {
    if (t.result === type) count += 1;
    else break;
  }
  return { type, count };
}

/**
 * Répartit les ratios risk/reward (saisie manuelle uniquement) en tranches
 * pour un histogramme. Tranches : <1, 1-2, 2-3, 3+.
 */
export function rrDistribution(trades) {
  const buckets = { "< 1R": 0, "1–2R": 0, "2–3R": 0, "3R+": 0 };
  trades.forEach((t) => {
    if (t.riskReward == null) return;
    const rr = t.riskReward;
    if (rr < 1) buckets["< 1R"] += 1;
    else if (rr < 2) buckets["1–2R"] += 1;
    else if (rr < 3) buckets["2–3R"] += 1;
    else buckets["3R+"] += 1;
  });
  return Object.entries(buckets).map(([label, count]) => ({ label, count }));
}

/**
 * Moyenne du taux de respect de la checklist (checklistScore est un % 0-100
 * stocké sur chaque trade au moment de la création, voir lib/trades.js).
 */
export function avgChecklistScore(trades) {
  const scored = trades.filter((t) => t.checklistScore != null);
  if (scored.length === 0) return null;
  return scored.reduce((sum, t) => sum + t.checklistScore, 0) / scored.length;
}

/**
 * Regroupe les trades du mois en cours par jour pour le graphique,
 * en cumulant le P&L manuel ($) par date.
 */
export function dailyPLSeries(trades, monthRange) {
  const filtered = trades.filter(
    (t) => t.date && inRange(t.date, monthRange) && t.isManualResult && t.profitLoss != null
  );
  const byDate = {};
  filtered.forEach((t) => {
    byDate[t.date] = (byDate[t.date] || 0) + t.profitLoss;
  });
  return Object.entries(byDate)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, pl]) => ({ date: date.slice(5), pl: Math.round(pl * 100) / 100 }));
}
