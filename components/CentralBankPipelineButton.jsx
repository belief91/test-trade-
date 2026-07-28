// components/CentralBankPipelineButton.jsx
"use client";

import { useState } from "react";

export default function CentralBankPipelineButton() {
  const [loading, setLoading] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState(null);

  async function lancerPipeline() {
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
    <div>
      <button onClick={lancerPipeline} disabled={loading}>
        {loading ? "Scraping en cours..." : "Lancer le scraping BC"}
      </button>

      {resultat && resultat.status === "ok" && (
        <div>
          <p>Document final ({resultat.documentFinal.length} paragraphe(s)) :</p>
          <ul>
            {resultat.documentFinal.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {resultat && resultat.status === "skip" && (
        <p>Skip : {resultat.reason}</p>
      )}

      {erreur && <p style={{ color: "red" }}>Erreur : {erreur}</p>}
    </div>
  );
}
