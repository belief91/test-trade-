// app/synthese/page.js
"use client";

import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";

export default function SynthesePage() {
  const [synthese, setSynthese] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    async function charger() {
      try {
        const res = await fetch("/api/synthese/derniere");
        const data = await res.json();
        if (data.success) {
          setSynthese(data);
        } else {
          setErreur(data.error || "Aucune synthèse disponible");
        }
      } catch (err) {
        setErreur(err.message);
      } finally {
        setLoading(false);
      }
    }
    charger();
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Sparkles size={22} style={{ color: "var(--accent)" }} />
        <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 20, fontWeight: 800 }}>
          Synthèse IA
        </h1>
      </div>

      {loading && <p>Chargement...</p>}

      {erreur && (
        <div style={{ background: "var(--surface)", border: "1px solid #e5484d", borderRadius: 10, padding: 16, color: "#e5484d" }}>
          {erreur}
        </div>
      )}

      {synthese && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 20 }}>
          <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 12 }}>
            {synthese.periode === "hebdomadaire" ? "Résumé hebdomadaire" : "Synthèse quotidienne"} — {synthese.dateTexte}
          </p>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{synthese.texte}</div>
        </div>
      )}
    </div>
  );
}
