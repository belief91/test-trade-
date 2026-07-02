"use client";

import { useEffect, useState } from "react";
import { listenToTrades } from "../lib/trades";
import TradeRow from "./TradeRow";

const COLS = ["", "Date", "Paire", "Résultat", "Sens", "Compte", "Setup", "Saisie", "P&L", ""];

export default function TradeList() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = listenToTrades((data) => { setTrades(data); setLoading(false); });
    return unsub;
  }, []);

  if (loading) return <div className="card card-p" style={{ color: "var(--muted)" }}>Chargement du blotter…</div>;
  if (trades.length === 0) return (
    <div className="card" style={{ padding: "48px 20px", textAlign: "center", color: "var(--muted)" }}>
      Aucun trade enregistré. Ajoute ton premier trade ci-dessus.
    </div>
  );

  return (
    <div className="card">
      <div style={{ display: "grid", gridTemplateColumns: "4px 90px 90px 60px 80px 80px 1fr auto 90px 32px", gap: 10, padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
        {COLS.map((col, i) => (
          <span key={i} style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>{col}</span>
        ))}
      </div>
      {trades.map(trade => <TradeRow key={trade.id} trade={trade} />)}
    </div>
  );
}
