// app/test-central-bank/page.js
//
// Page de VISUALISATION du test central-bank-fed (voir conversation du
// 29/08-01/09). Lecture seule — ne déclenche jamais de scraping (ça
// reste le rôle exclusif du cron 4x/jour). Sert uniquement à inspecter
// visuellement les résultats déjà écrits sur test/central-bank-fed.json,
// pour repérer si le filtre de mots-clés bancaire laisse passer trop
// ou pas assez de contenu, sans avoir à ouvrir le JSON brut sur
// Cloudflare.
//
// À SUPPRIMER en même temps que le reste du module de test une fois la
// production confirmée stable (voir la liste donnée dans la
// conversation : testScraperFed.js, route Render, client, route de
// scraping, cette page + sa route de lecture, cron, classe Back4App).

"use client";

import { useState, useEffect } from "react";
import { RefreshCw, FlaskConical, ChevronDown, ChevronUp } from "lucide-react";

const COULEUR_STATUS = {
  ok: "#2fb344",
  vide_apres_filtre: "#e6a700",
  error: "#e5484d",
};

const LABEL_STATUS = {
  ok: "OK — contenu retenu",
  vide_apres_filtre: "Vide après filtre mots-clés",
  error: "Erreur",
};

export default function TestCentralBankPage() {
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [donnees, setDonnees] = useState(null);
  const [ouverts, setOuverts] = useState({});

  async function charger() {
    setLoading(true);
    setErreur(null);
    try {
      const res = await fetch("/api/test/central-bank-fed/lire");
      const data = await res.json();
      if (data.status === "error") {
        setErreur(data.message);
        setDonnees(null);
      } else {
        setDonnees(data);
      }
    } catch (err) {
      setErreur(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  const historiqueTrie = donnees?.historique
    ? [...donnees.historique].reverse() // plus récent en premier
    : [];

  // Petit résumé par catégorie : combien de fois "ok" vs "error" vs "vide"
  const resume = {};
  for (const entree of historiqueTrie) {
    if (!resume[entree.categorie]) {
      resume[entree.categorie] = { ok: 0, vide_apres_filtre: 0, error: 0 };
    }
    resume[entree.categorie][entree.status] = (resume[entree.categorie][entree.status] || 0) + 1;
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <FlaskConical size={22} style={{ color: "var(--accent)" }} />
        <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 20, fontWeight: 800 }}>
          Test isolé — Banque Centrale Fed
        </h1>
      </div>
      <p style={{ opacity: 0.7, fontSize: 13, marginBottom: 20 }}>
        Lecture seule. Alimenté par un cron 4x/jour (03h/09h/15h/21h GMT+3), sans lien avec la production.
      </p>

      <button
        onClick={charger}
        disabled={loading}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--accent-blue-dark)",
          color: "#fff",
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
        {loading ? "Chargement..." : "Rafraîchir la vue"}
      </button>

      {erreur && (
        <div style={{ background: "var(--surface)", border: "1px solid #e5484d", borderRadius: 10, padding: 16, color: "#e5484d", marginBottom: 20 }}>
          {erreur}
        </div>
      )}

      {donnees && (
        <>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <p style={{ fontWeight: 700, marginBottom: 10 }}>
              {donnees.count} entrées au total — dernière mise à jour : {new Date(donnees.updatedAt).toLocaleString("fr-FR")}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(resume).map(([categorie, compte]) => (
                <div key={categorie} style={{ display: "flex", gap: 12, fontSize: 13 }}>
                  <span style={{ fontWeight: 700, minWidth: 140 }}>{categorie}</span>
                  <span style={{ color: COULEUR_STATUS.ok }}>{compte.ok || 0} ok</span>
                  <span style={{ color: COULEUR_STATUS.vide_apres_filtre }}>{compte.vide_apres_filtre || 0} vide</span>
                  <span style={{ color: COULEUR_STATUS.error }}>{compte.error || 0} erreur</span>
                </div>
              ))}
            </div>
          </div>

          {historiqueTrie.map((entree, idx) => {
            const estOuvert = !!ouverts[idx];
            return (
              <div
                key={idx}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontWeight: 700 }}>{entree.categorie}</span>
                    <span style={{ opacity: 0.6, fontSize: 12, marginLeft: 10 }}>
                      {new Date(entree.horodatageRun).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  <span style={{ color: COULEUR_STATUS[entree.status] || "#999", fontWeight: 700, fontSize: 13 }}>
                    {LABEL_STATUS[entree.status] || entree.status}
                  </span>
                </div>

                {entree.status === "error" && (
                  <p style={{ color: "#e5484d", marginTop: 8, fontSize: 13 }}>{entree.messageErreur}</p>
                )}

                {entree.status !== "error" && (
                  <>
                    <p style={{ opacity: 0.7, fontSize: 13, marginTop: 8 }}>
                      {(entree.documentFinal || []).length} phrase(s) retenue(s)
                      {entree.source ? ` — source : ${entree.source}` : ""}
                    </p>
                    {(entree.documentFinal || []).length > 0 && (
                      <>
                        <button
                          onClick={() => setOuverts((o) => ({ ...o, [idx]: !o[idx] }))}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            background: "none",
                            border: "none",
                            color: "var(--accent-blue-dark)",
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: "pointer",
                            padding: 0,
                            marginTop: 8,
                          }}
                        >
                          {estOuvert ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          {estOuvert ? "Masquer le contenu" : "Voir le contenu filtré"}
                        </button>
                        {estOuvert && (
                          <ul style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 18, marginTop: 10 }}>
                            {entree.documentFinal.map((p, i) => (
                              <li key={i} style={{ lineHeight: 1.5, fontSize: 14 }}>{p}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </>
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
