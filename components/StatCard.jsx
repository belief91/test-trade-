import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function StatCard({ label, stats, icon: Icon }) {
  const { total, wins, losses, winRate, totalPL, avgPct } = stats;

  const trendColor =
    winRate == null ? "text-muted" : winRate >= 50 ? "text-win" : "text-loss";
  const barColor =
    winRate == null ? "bg-border" : winRate >= 50 ? "bg-win" : "bg-loss";
  const TrendIcon = winRate == null ? Minus : winRate >= 50 ? TrendingUp : TrendingDown;

  return (
    <div className="group relative bg-surface border border-border rounded-lg p-5 overflow-hidden transition-colors hover:border-accent/40">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${barColor}`} />

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-widest text-accent">{label}</p>
        {Icon && <Icon size={15} className="text-muted" strokeWidth={1.75} />}
      </div>

      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-display text-4xl text-ink tabular leading-none">
          {winRate != null ? `${winRate.toFixed(0)}%` : "—"}
        </span>
        <TrendIcon size={16} className={trendColor} strokeWidth={2} />
      </div>

      <p className="text-xs text-muted mb-4">
        {total} trade{total !== 1 ? "s" : ""} <span className="text-win">{wins}W</span> / <span className="text-loss">{losses}L</span>
      </p>

      <div className="flex gap-4 text-sm border-t border-border pt-3">
        {totalPL != null && (
          <span className={`tabular font-medium ${totalPL >= 0 ? "text-win" : "text-loss"}`}>
            {totalPL >= 0 ? "+" : ""}{totalPL.toFixed(2)}$
          </span>
        )}
        {avgPct != null && (
          <span className={`tabular font-medium ${avgPct >= 0 ? "text-win" : "text-loss"}`}>
            {avgPct >= 0 ? "+" : ""}{avgPct.toFixed(2)}% moy.
          </span>
        )}
        {totalPL == null && avgPct == null && (
          <span className="text-muted text-xs">aucun résultat chiffré</span>
        )}
      </div>
    </div>
  );
}
