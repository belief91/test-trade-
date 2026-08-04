"use client";

import { useState, useEffect, useCallback } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

/**
 * Affiche les articles géopolitiques TV5MONDE des dernières 24h et permet
 * de relancer un scraping à la demande via le bouton "Recharger".
 *
 * Appelle /api/geopolitics-news (non protégé, même pattern que
 * /api/central-bank-calendar) — relance le scraping en direct, upsert dans
 * Back4App, et renvoie la fenêtre glissante 24h à jour.
 */
export default function GeopoliticalNewsList() {
  const [articles, setArticles] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [derniereMiseAJour, setDerniereMiseAJour] = useState(null);
  const [nouveaux, setNouveaux] = useState(0);

  const chargerDonnees = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const res = await fetch("/api/geopolitics-news");
      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "Erreur inconnue lors du scraping");
      }

      setArticles(json.data);
      setNouveaux(json.nouveauxArticles || 0);
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
    <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontFamily: "Space Grotesk, sans-serif", color: "var(--text)" }}>
            Actu Géopolitique
          </h2>
          <span style={{ fontSize: "0.8rem", color: "var(--sub)" }}>Source : TV5MONDE — rubrique International</span>
        </div>

        <button
          onClick={chargerDonnees}
          disabled={chargement}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0.5rem 1rem",
            backgroundColor: chargement ? "rgba(240,165,0,0.4)" : "#F0A500",
            color: "#0A0C10",
            border: "none",
            borderRadius: 8,
            cursor: chargement ? "not-allowed" : "pointer",
            fontWeight: 700,
            fontSize: "0.85rem",
          }}
        >
          <RefreshCw size={14} style={{ animation: chargement ? "spin 1s linear infinite" : "none" }} />
          {chargement ? "Chargement..." : "Recharger"}
        </button>
      </div>

      {derniereMiseAJour && !chargement && (
        <p style={{ fontSize: "0.8rem", color: "var(--sub)", marginTop: 0 }}>
          Dernière mise à jour : {derniereMiseAJour.toLocaleString("fr-FR")}
          {nouveaux > 0 && ` — ${nouveaux} nouvel${nouveaux > 1 ? "les" : ""} article${nouveaux > 1 ? "s" : ""}`}
        </p>
      )}

      {erreur && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "rgba(179,38,30,0.12)",
            color: "#b3261e",
            borderRadius: 8,
            marginBottom: "1rem",
          }}
        >
          Erreur : {erreur}
        </div>
      )}

      {chargement && articles.length === 0 ? (
        <p style={{ color: "var(--sub)" }}>Scraping en cours...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {articles.map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                padding: "1rem",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                textDecoration: "none",
                color: "var(--text)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>
                  {a.categorie || "International"}
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--sub)" }}>
                  {a.publieLe ? new Date(a.publieLe).toLocaleString("fr-FR") : ""}
                </span>
              </div>
              <h3 style={{ margin: "0.4rem 0", fontSize: "1rem", lineHeight: 1.35 }}>
                {a.titre} <ExternalLink size={12} style={{ verticalAlign: "middle", opacity: 0.6 }} />
              </h3>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--sub)", lineHeight: 1.5 }}>
                {a.description}
              </p>
            </a>
          ))}

          {articles.length === 0 && !chargement && (
            <p style={{ color: "var(--sub)" }}>Aucun article publié dans les dernières 24h.</p>
          )}
        </div>
      )}
    </div>
  );
}
