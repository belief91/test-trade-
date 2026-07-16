"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Affiche le calendrier économique BC (G10, fort impact, semaine en cours)
 * et permet de relancer un scraping à la demande via le bouton "Recharger".
 *
 * Le bouton appelle /api/central-bank-calendar (déclenchement manuel, pas
 * protégé par CRON_SECRET contrairement à /api/cron/scraping) qui relance
 * le scraping en direct et re-sauvegarde dans Back4App à chaque appel.
 */
export default function CentralBankCalendarTable() {
  const [evenements, setEvenements] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [derniereMiseAJour, setDerniereMiseAJour] = useState(null);

  const chargerDonnees = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const res = await fetch("/api/central-bank-calendar");
      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "Erreur inconnue lors du scraping");
      }

      setEvenements(json.data);
      setDerniereMiseAJour(new Date());
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    chargerDonnees();
  }, [chargerDonnees]);

  return (
    <div style={{ padding: "1.5rem", fontFamily: "sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h2 style={{ margin: 0 }}>Calendrier Économique — Banques Centrales (G10)</h2>
        <button
          onClick={chargerDonnees}
          disabled={chargement}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: chargement ? "#999" : "#1a73e8",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: chargement ? "not-allowed" : "pointer",
            fontWeight: "bold",
          }}
        >
          {chargement ? "Chargement..." : "🔄 Recharger"}
        </button>
      </div>

      {derniereMiseAJour && !chargement && (
        <p style={{ fontSize: "0.85rem", color: "#666", marginTop: 0 }}>
          Dernière mise à jour : {derniereMiseAJour.toLocaleString("fr-FR")}
        </p>
      )}

      {erreur && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "#fdecea",
            color: "#b3261e",
            borderRadius: "6px",
            marginBottom: "1rem",
          }}
        >
          Erreur : {erreur}
        </div>
      )}

      {chargement && evenements.length === 0 ? (
        <p>Scraping en cours...</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f5f5f5", textAlign: "left" }}>
                <th style={cellStyle}>Date</th>
                <th style={cellStyle}>Heure (GMT+3)</th>
                <th style={cellStyle}>Devise</th>
                <th style={cellStyle}>Événement</th>
                <th style={cellStyle}>Réel</th>
                <th style={cellStyle}>Précédent</th>
                <th style={cellStyle}>Consensus</th>
                <th style={cellStyle}>Prévision</th>
                <th style={cellStyle}>Impact</th>
              </tr>
            </thead>
            <tbody>
              {evenements.map((e, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={cellStyle}>{e.date}</td>
                  <td style={cellStyle}>{e.heureGmt3}</td>
                  <td style={cellStyle}>
                    <strong>{e.devise}</strong>
                  </td>
                  <td style={cellStyle}>{e.evenement}</td>
                  <td style={cellStyle}>{e.reel || "—"}</td>
                  <td style={cellStyle}>{e.precedent || "—"}</td>
                  <td style={cellStyle}>{e.consensus || "—"}</td>
                  <td style={cellStyle}>{e.prevision || "—"}</td>
                  <td style={cellStyle}>{e.impact}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {evenements.length === 0 && !chargement && (
            <p style={{ marginTop: "1rem", color: "#666" }}>
              Aucun événement trouvé pour cette semaine.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const cellStyle = {
  padding: "0.6rem 0.8rem",
  fontSize: "0.9rem",
};
