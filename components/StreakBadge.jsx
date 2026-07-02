import { Flame, Snowflake } from "lucide-react";

export default function StreakBadge({ streak }) {
  const { type, count } = streak;

  if (!type || count === 0) {
    return (
      <div className="bg-surface border border-border rounded-lg p-5 flex items-center gap-3">
        <span className="text-muted text-sm">Pas encore de série en cours.</span>
      </div>
    );
  }

  const isWin = type === "Win";
  const Icon = isWin ? Flame : Snowflake;

  return (
    <div className="bg-surface border border-border rounded-lg p-5 flex items-center gap-4">
      <Icon size={28} className={isWin ? "text-win" : "text-loss"} strokeWidth={1.5} />
      <div>
        <p className="font-display text-2xl text-ink tabular leading-none">
          {count} {isWin ? "victoire" : "perte"}{count > 1 ? "s" : ""}
        </p>
        <p className="text-xs text-muted mt-1">consécutive{count > 1 ? "s" : ""}</p>
      </div>
    </div>
  );
}
