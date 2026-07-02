"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { deleteTrade } from "../lib/trades";

export default function TradeRow({ trade }) {
  const [expanded, setExpanded] = useState(false);
  const [localTrade, setLocalTrade] = useState(trade);

  const isWin = localTrade.result === "Win";
  const isLoss = localTrade.result === "Loss";

  async function handleDelete(e) {
    e.stopPropagation();
    if (!confirm("Supprimer ce trade définitivement ?")) return;
    await deleteTrade(localTrade.id);
  }

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div onClick={() => setExpanded(v => !v)} style={{ display: "grid", gridTemplateColumns: "4px 90px 90px 60px 80px 80px 1fr auto 90px 32px", gap: 10, alignItems: "center", padding: "11px 16px", cursor: "pointer", transition: "background 120ms" }}
        onMouseEnter={e => e.currentTarget.style.background = "var(--raised)"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >
        <div style={{ width: 4, height: 32, borderRadius: 2, background: isWin ? "var(--win)" : isLoss ? "var(--loss)" : "var(--border)" }} />
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--sub)" }}>{localTrade.date}</span>
        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{localTrade.paire}</span>
        <span className={`badge ${isWin ? "badge-win" : isLoss ? "badge-loss" : "badge-neutral"}`}>{localTrade.result || "—"}</span>
        <span style={{ fontSize: 12, color: "var(--sub)" }}>{localTrade.direction?.toUpperCase()}</span>
        <span style={{ fontSize: 12, color: "var(--sub)" }}>{localTrade.account}</span>
        <span style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{localTrade.setup || "—"}</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{localTrade.isManualResult ? <span className="badge badge-accent">Manuel</span> : ""}</span>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, fontWeight: 600, textAlign: "right", color: isWin ? "var(--win)" : isLoss ? "var(--loss)" : "var(--muted)" }}>
          {localTrade.profitLoss != null ? `${localTrade.profitLoss > 0 ? "+" : ""}${localTrade.profitLoss}${localTrade.isManualResult ? "$" : "%"}` : "En cours"}
        </span>
        {expanded ? <ChevronUp size={14} style={{ color: "var(--muted)" }} /> : <ChevronDown size={14} style={{ color: "var(--muted)" }} />}
      </div>

      {expanded && (
        <div style={{ padding: "16px 20px 20px", background: "var(--raised)", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[["Stop loss", localTrade.sl], ["Take profit", localTrade.tp], ["Sortie", localTrade.exit], ["R:R", localTrade.riskReward != null ? `${localTrade.riskReward}R` : null]].map(([label, value]) => (
              <div key={label}>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 2 }}>{label}</p>
                <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: "var(--ink)" }}>{value ?? "—"}</p>
              </div>
            ))}
          </div>
          {localTrade.notes && <p style={{ fontSize: 13, color: "var(--sub)", lineHeight: 1.5 }}>{localTrade.notes}</p>}
          <button onClick={handleDelete} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--loss)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: 0 }}>
            <Trash2 size={13} /> Supprimer ce trade
          </button>
        </div>
      )}
    </div>
  );
}
