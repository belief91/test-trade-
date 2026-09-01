"use client";

// components/IASyntheseButton.jsx
// Bouton indépendant "IA Synthèse" — déclenchement MANUEL de l'appel LLM d'un module.
// But : comparer visuellement la sortie brute du prompt à chaque itération, sans dépendre
// d'un cron ou d'un affichage permanent sur la page. Purement un outil de test.
//
// Usage dans une page module (ex: app/cot/page.jsx) :
//
//   import IASyntheseButton from "../../components/IASyntheseButton";
//   <IASyntheseButton moduleLabel="COT" endpoint="/api/cot/analyse" method="POST" />
//
// `body` (optionnel) : payload envoyé tel quel en JSON.stringify au endpoint,
// utile pour le module COT qui accepte { vueMacroParDevise: {...} }.

import { useState } from "react";
import { Sparkles, X, Loader2 } from "lucide-react";

export default function IASyntheseButton({ moduleLabel, endpoint, method = "POST", body = {} }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(null);

  async function lancerSynthese() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setResult(null);
    const debut = performance.now();

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      setResult(data);
    } catch (err) {
      setError(err.message || "Erreur inconnue");
    } finally {
      setElapsedMs(Math.round(performance.now() - debut));
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={lancerSynthese}
        disabled={loading}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid var(--border)",
          background: loading ? "var(--accent-blue-dark-dim)" : "var(--accent-blue-dark)",
          color: loading ? "var(--accent-blue-dark)" : "#fff",
          fontSize: 13,
          fontWeight: 700,
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} strokeWidth={2.5} />}
        {loading ? "Génération..." : `IA Synthèse — ${moduleLabel}`}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 10, maxWidth: 720, width: "100%", maxHeight: "80vh",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}
          >
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 16px", borderBottom: "1px solid var(--border)",
            }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: "var(--accent-blue-dark)" }}>
                IA Synthèse — {moduleLabel} {elapsedMs !== null && !loading && `(${elapsedMs} ms)`}
              </span>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--sub)" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 16, overflowY: "auto" }}>
              {loading && (
                <div style={{ color: "var(--sub)", fontSize: 13 }}>Appel du prompt en cours...</div>
              )}

              {error && (
                <div style={{ color: "#E5484D", fontSize: 13, fontFamily: "monospace" }}>
                  Erreur : {error}
                </div>
              )}

              {result && (
                <pre style={{
                  fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap",
                  wordBreak: "break-word", color: "var(--sub)", margin: 0,
                }}>
                  {JSON.stringify(result, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
