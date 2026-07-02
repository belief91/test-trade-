"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Flame, Snowflake, Calendar, BarChart2, CheckSquare } from "lucide-react";
import { listenToTrades } from "../../lib/trades";
import { getPeriodRanges, statsForPeriod, dailyPLSeries, groupedWinRate, currentStreak, rrDistribution, avgChecklistScore } from "../../lib/stats";
import PnlChart from "../../components/PnlChart";
import PairSetupTable from "../../components/PairSetupTable";
import RRHistogram from "../../components/RRHistogram";
import PlanSection from "../../components/PlanSection";
import CalendarSection from "../../components/CalendarSection";

function StatCard({ label, stats, icon: Icon }) {
  const { total, wins, losses, winRate } = stats;
  const decided = wins + losses;
  const isGood = winRate != null && winRate >= 50;
  const isBad = winRate != null && winRate < 50;
  const TrendIcon = winRate == null ? Minus : winRate >= 50 ? TrendingUp : TrendingDown;

  return (
    <div className="stat-card animate-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sub)" }}>{label}</span>
        {Icon && <Icon size={16} style={{ color: "var(--muted)" }} strokeWidth={1.75} />}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 4 }}>
        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 36, fontWeight: 700, lineHeight: 1, color: winRate == null ? "var(--muted)" : isGood ? "var(--win)" : "var(--loss)" }}>
          {winRate != null ? `${winRate.toFixed(0)}%` : "—"}
        </span>
        <TrendIcon size={18} style={{ color: isGood ? "var(--win)" : isBad ? "var(--loss)" : "var(--muted)", marginBottom: 4 }} />
      </div>
      <p style={{ fontSize: 12, color: "var(--sub)", marginBottom: 12 }}>
        {decided} trade{decided !== 1 ? "s" : ""} · <span style={{ color: "var(--win)" }}>{wins}W</span> / <span style={{ color: "var(--loss)" }}>{losses}L</span>
      </p>
      {stats.totalPL != null && (
        <p style={{ fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 500, color: stats.totalPL >= 0 ? "var(--win)" : "var(--loss)" }}>
          {stats.totalPL >= 0 ? "+" : ""}{stats.totalPL.toFixed(2)}$
        </p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = listenToTrades((data) => { setTrades(data); setLoading(false); });
    return unsubscribe;
  }, []);

  const ranges = useMemo(() => getPeriodRanges(), []);
  const statsJour = useMemo(() => statsForPeriod(trades, ranges.today), [trades, ranges]);
  const statsSemaine = useMemo(() => statsForPeriod(trades, ranges.week), [trades, ranges]);
  const statsMois = useMemo(() => statsForPeriod(trades, ranges.month), [trades, ranges]);
  const chartData = useMemo(() => dailyPLSeries(trades, ranges.month), [trades, ranges]);
  const parPaire = useMemo(() => groupedWinRate(trades, "paire"), [trades]);
  const parSetup = useMemo(() => groupedWinRate(trades, "setup"), [trades]);
  const streak = useMemo(() => currentStreak(trades), [trades]);
  const rrData = useMemo(() => rrDistribution(trades), [trades]);
  const checklistScore = useMemo(() => avgChecklistScore(trades), [trades]);

  if (loading) return (
    <div className="dashboard-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--muted)", fontSize: 14 }}>Chargement…</p>
    </div>
  );

  const StrIcon = streak.type === "Win" ? Flame : Snowflake;
  const strColor = streak.type === "Win" ? "var(--win)" : streak.type === "Loss" ? "var(--loss)" : "var(--muted)";

  return (
    <div className="dashboard-bg">
      {/* Hero band — toujours navy foncé, contraste fort peu importe le thème actif */}
      <div className="hero-band">
        <div className="hero-band__glow-a" />
        <div className="hero-band__glow-b" />
        <div className="hero-band__grid" />
        <div className="hero-band__content" style={{ maxWidth: 1100, margin: "0 auto", padding: "44px 20px 40px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#F0A500", marginBottom: 10 }}>
            BELIEFX
          </p>
          <h1 style={{ fontSize: 36, lineHeight: 1.1, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, color: "#FFFFFF", margin: 0, maxWidth: 480 }}>
            Dashboard
          </h1>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, marginTop: 10, maxWidth: 440 }}>
            Performance en temps réel — {statsMois.total} trade{statsMois.total !== 1 ? "s" : ""} ce mois-ci.
          </p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 20, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 99, padding: "7px 16px" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: statsMois.winRate != null && statsMois.winRate >= 50 ? "#22C55E" : "#EF4444" }} />
            <span style={{ fontSize: 12, color: "#FFFFFF", fontFamily: "JetBrains Mono, monospace" }}>
              {statsMois.winRate != null ? `${statsMois.winRate.toFixed(0)}% win rate ce mois` : "Pas encore de résultat ce mois-ci"}
            </span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px 36px", display: "flex", flexDirection: "column", gap: 28 }}>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <StatCard label="Aujourd'hui" stats={statsJour} />
          <StatCard label="Cette semaine" stats={statsSemaine} />
          <StatCard label="Ce mois" stats={statsMois} />

          {/* Streak */}
          <div className="stat-card animate-in" style={{ "--before-bg": strColor }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sub)", marginBottom: 12 }}>Série en cours</p>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <StrIcon size={28} style={{ color: strColor }} strokeWidth={1.5} />
              <div>
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 28, fontWeight: 700, color: strColor, lineHeight: 1 }}>
                  {streak.count > 0 ? streak.count : "—"}
                </p>
                <p style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
                  {streak.type ? `${streak.type === "Win" ? "Victoire" : "Perte"}${streak.count > 1 ? "s" : ""} consécutive${streak.count > 1 ? "s" : ""}` : "Aucune série"}
                </p>
              </div>
            </div>
          </div>

          {/* Checklist score */}
          <div className="stat-card animate-in">
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sub)", marginBottom: 12 }}>Respect checklist</p>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 36, fontWeight: 700, lineHeight: 1, color: checklistScore != null && checklistScore >= 70 ? "var(--win)" : "var(--accent)" }}>
              {checklistScore != null ? `${checklistScore.toFixed(0)}%` : "—"}
            </p>
            <div style={{ marginTop: 10, background: "var(--raised)", borderRadius: 99, height: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${checklistScore ?? 0}%`, background: "var(--accent)", borderRadius: 99 }} />
            </div>
          </div>
        </div>

        {/* Graphique P&L */}
        <PnlChart data={chartData} />

        {/* Par paire & setup */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <PairSetupTable title="Par paire" rows={parPaire} />
          <PairSetupTable title="Par setup" rows={parSetup} />
        </div>

        {/* Distribution R:R */}
        <RRHistogram data={rrData} />

        {/* Plan & Calendar repliables */}
        <PlanSection />
        <CalendarSection trades={trades} />
      </div>
    </div>
  );
}
