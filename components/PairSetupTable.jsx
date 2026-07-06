export default function PairSetupTable({ title, rows }) {
  if (rows.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-lg p-5">
        <p className="text-xs uppercase tracking-widest text-accent mb-3">{title}</p>
        <p className="text-muted text-xs">Pas encore assez de données.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <p className="text-xs uppercase tracking-widest text-accent mb-3">{title}</p>
      <div className="space-y-2">
        {rows.slice(0, 5).map((row) => (
          <div key={row.key} className="flex items-center gap-3 text-sm">
            <span className="text-ink flex-1 truncate">{row.key}</span>
            <span className="text-muted text-xs tabular">{row.total} trades</span>
            <div className="w-20 h-1.5 bg-raised rounded-full overflow-hidden">
              <div
                className={`h-full ${row.winRate >= 50 ? "bg-win" : "bg-loss"}`}
                style={{ width: `${Math.min(100, row.winRate)}%` }}
              />
            </div>
            <span className="tabular text-xs w-10 text-right text-muted">{row.winRate.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
