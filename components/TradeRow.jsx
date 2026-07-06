"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { deleteTrade } from "../lib/trades";

/** Affiche "JJ/MM" (sans année) suivi de l'heure réelle d'enregistrement (Parse createdAt). */
function formatDateHeure(dateStr, createdAt) {
  const [, m, d] = (dateStr || "").split("-");
  const dateCourte = d && m ? `${d}/${m}` : dateStr;
  if (!createdAt) return dateCourte;
  const heure = new Date(createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${dateCourte} · ${heure}`;
}

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
      <div onClick={() => setExpanded(v => !v)} style={{ display: "grid", gridTemplateColumns: "4px 104px 76px 60px 1fr 32px", gap: 12, alignItems: "center", padding: "12px 16px", cursor: "pointer", transition: "background 120ms" }}
        onMouseEnter={e => e.currentTarget.style.background = "var(--raised)"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >
        <div style={{ width: 4, height: 34, borderRadius: 2, background: isWin ? "var(--win)" : isLoss ? "var(--loss)" : "var(--border)" }} />
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--sub)" }}>{formatDateHeure(localTrade.date, localTrade.createdAt)}</span>
        <span style={{ fontWeight: 500, fontSize: 12, color: "var(--sub)" }}>{localTrade.paire}</span>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{localTrade.direction?.toUpperCase()}</span>

        {/* Setup — élément le plus important visuellement de la ligne */}
        <span style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {localTrade.setup || "—"}
        </span>

        {expanded ? <ChevronUp size={14} style={{ color: "var(--muted)" }} /> : <ChevronDown size={14} style={{ color: "var(--muted)" }} />}
      </div>

      {expanded && (
        <div style={{ padding: "16px 20px 20px", background: "var(--raised)", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            {[
              ["Entrée", localTrade.entry],
              ["Stop loss", localTrade.sl],
              ["Take profit", localTrade.tp],
              ["Prix de sortie", localTrade.exit],
              ["R:R", localTrade.riskReward != null ? `${localTrade.riskReward}R` : null],
            ].map(([label, value]) => (
              <div key={label}>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 2 }}>{label}</p>
                <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: "var(--ink)" }}>{value ?? "—"}</p>
              </div>
            ))}
          </div>
          {localTrade.profitLoss != null && (
            <p style={{ fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: isWin ? "var(--win)" : isLoss ? "var(--loss)" : "var(--muted)" }}>
              {localTrade.profitLoss > 0 ? "+" : ""}{localTrade.profitLoss}{localTrade.isManualResult ? "$" : "%"}
            </p>
          )}
          {localTrade.notes && <p style={{ fontSize: 13, color: "var(--sub)", lineHeight: 1.5 }}>{localTrade.notes}</p>}
          <button onClick={handleDelete} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--loss)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: 0 }}>
            <Trash2 size={13} /> Supprimer ce trade
          </button>
        </div>
      )}
    </div>
  );
}
