// app/bank-central/page.js
"use client";

import { useState } from "react";
import { RefreshCw, Landmark } from "lucide-react";

export default function BankCentralPage() {
  const [loading, setLoading] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState(null);

  async function lancerScraping() {
    setLoading(true);
    setErreur(null);
    setResultat(null);

    try {
      const res = await fetch("/api/pipeline/run", { method: "POST" });
      const data = await res.json();

      if (data.status === "error") {
        setErreur(data.message);
      } else {
        setResultat(data);
      }
    } catch (err) {
      setErreur(err.message);
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

      {resultat && resultat.status === "ok" && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
          <p style={{ fontWeight: 700, marginBottom: 10 }}>
            Document final — {resultat.documentFinal.length} paragraphe(s)
          </p>
          <ul style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 18 }}>
            {resultat.documentFinal.map((p, i) => (
              <li key={i} style={{ lineHeight: 1.5 }}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {resultat && resultat.status === "skip" && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
          <p>Skip : {resultat.reason}</p>
          {resultat.dernierEventConnu && resultat.dernierEventConnu.length > 0 && (
            <>
              <p style={{ fontWeight: 700, marginTop: 12, marginBottom: 8 }}>
                Dernier événement bancaire connu :
              </p>
              <ul style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 18 }}>
                {resultat.dernierEventConnu.map((p, i) => (
                  <li key={i} style={{ lineHeight: 1.5 }}>{p}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {erreur && (
        <div style={{ background: "var(--surface)", border: "1px solid #e5484d", borderRadius: 10, padding: 16, color: "#e5484d" }}>
          Erreur : {erreur}
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
