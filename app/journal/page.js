"use client";

import { Suspense, useState } from "react";
import { BookOpen } from "lucide-react";
import TradeForm from "../../components/TradeForm";
import TradeList from "../../components/TradeList";

export default function JournalPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 20px", display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <p className="section-label">Module</p>
        <h1 style={{ fontSize: 28, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, color: "var(--ink)", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <BookOpen size={22} style={{ color: "var(--accent)" }} /> Journal de trading
        </h1>
        <p style={{ color: "var(--sub)", fontSize: 13, marginTop: 4 }}>Chaque ligne, une décision.</p>
      </div>

      <Suspense fallback={<div className="card card-p" style={{ color: "var(--muted)" }}>Chargement…</div>}>
        <TradeForm onCreated={() => setRefreshKey(k => k + 1)} />
      </Suspense>

      <div>
        <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 12 }}>Historique</h2>
        <TradeList key={refreshKey} />
      </div>
    </div>
  );
}
