// app/bank-central/page.js
"use client";

import { useState } from "react";
import { RefreshCw, Landmark } from "lucide-react";

export default function BankCentralPage() {
  const [loading, setLoading] = useState(false);
  const [resultats, setResultats] = useState(null);
  const [erreurGlobale, setErreurGlobale] = useState(null);

  async function lancerScraping() {
    setLoading(true);
    setErreurGlobale(null);
    setResultats(null);

    try {
      const res = await fetch("/api/pipeline/run", { method: "POST" });
      const data = await res.json();

      if (data.status === "error") {
        setErreurGlobale(data.message);
      } else if (data.status === "skip") {
        setResultats({ skipGlobal: true, reason: data.reason });
      } else {
        setResultats({ liste: data.resultats });
      }
    } catch (err) {
      setErreurGlobale(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Landmark size={22} style={{ color: "var(--accent)" }} />
        <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 20, fontWeight: 800 }}>
          Banque Centrale
        </h1>
      </div>

      <button
        onClick={lancerScraping}
        disabled={loading}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#F0A500",
          color: "#0A0C10",
          border: "none",
          borderRadius: 8,
          padding: "10px 18px",
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
          marginBottom: 24,
        }}
      >
        <RefreshCw size={16} className={loading ? "spin" : ""} />
        {loading ? "Scraping en cours..." : "Recharger"}
      </button>

      {resultats && resultats.skipGlobal && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
          <p>Skip : {resultats.reason}</p>
        </div>
      )}

      {resultats && resultats.liste && resultats.liste.map((r, idx) => (
        <div
          key={idx}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <p style={{ fontWeight: 700, marginBottom: 8 }}>
            {r.devise} — {r.categorie}
          </p>

          {r.status === "ok" && (
            <>
              <p style={{ marginBottom: 8, opacity: 0.8 }}>
                {r.documentFinal.length} phrase(s) retenue(s)
              </p>
              <ul style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 18 }}>
                {r.documentFinal.map((p, i) => (
                  <li key={i} style={{ lineHeight: 1.5 }}>{p}</li>
                ))}
              </ul>
            </>
          )}

          {r.status === "skip" && (
            <>
              <p>Skip : {r.reason}</p>
              {r.dernierEventConnu && r.dernierEventConnu.length > 0 && (
                <>
                  <p style={{ fontWeight: 700, marginTop: 12, marginBottom: 8 }}>
                    Dernier événement connu ({r.devise}) :
                  </p>
                  <ul style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 18 }}>
                    {r.dernierEventConnu.map((p, i) => (
                      <li key={i} style={{ lineHeight: 1.5 }}>{p}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {r.status === "error" && (
            <p style={{ color: "#e5484d" }}>Erreur : {r.message}</p>
          )}
        </div>
      ))}

      {erreurGlobale && (
        <div style={{ background: "var(--surface)", border: "1px solid #e5484d", borderRadius: 10, padding: 16, color: "#e5484d" }}>
          Erreur : {erreurGlobale}
        </div>
      )}

      <style jsx>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
