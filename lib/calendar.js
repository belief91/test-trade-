import { startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toDateStr(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Construit une grille de semaines (tableaux de 7 cases, lundi en premier)
 * pour le mois donné. Les cases hors mois sont `null`.
 */
export function buildMonthGrid(year, month) {
  const first = new Date(year, month - 1, 1);
  const last = endOfMonth(first);
  const days = eachDayOfInterval({ start: startOfMonth(first), end: last });

  const leadingBlanks = (getDay(first) + 6) % 7; // lundi = 0
  const cells = [...Array(leadingBlanks).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Résume les trades d'une journée donnée (format "YYYY-MM-DD"). */
export function summarizeDay(trades, dateStr) {
  const dayTrades = trades.filter((t) => t.date === dateStr);
  const wins = dayTrades.filter((t) => t.result === "Win").length;
  const losses = dayTrades.filter((t) => t.result === "Loss").length;
  const pl = dayTrades
    .filter((t) => t.isManualResult && t.profitLoss != null)
    .reduce((sum, t) => sum + t.profitLoss, 0);
  return { count: dayTrades.length, wins, losses, pl, trades: dayTrades };
}
