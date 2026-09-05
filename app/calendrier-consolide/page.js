// app/calendrier-consolide/page.js
//
// Visualisation de raw/{date}/calendrier-consolide.json — module
// Calendrier BC, INDÉPENDANT du module de test central-bank-fed
// (app/test-central-bank/page.js). Ne pas mélanger les deux.
//
// Règles appliquées (définies dans la conversation du 05/09) :
//   - Chaque publication du jour est alignée avec ses familles liées,
//     dans l'ordre growth -> activity -> employment -> consumption
//     quand elles sont présentes dans famillesLiees.
//   - Les 4 mots de famille growth/activity/employment/consumption
//     sont affichés en bleu pour une lecture visuelle rapide.
//   - Une famille liée sans données dans contextePartage (absente ou
//     tableau vide) affiche explicitement "[vide]", jamais une case
//     blanche silencieuse.
//   - Les autres familles liées (inflation, trade, central_bank...)
//     restent affichées, dans l'ordre où famillesLiees les liste,
//     après les 4 familles prioritaires, sans code couleur spécifique.

"use client";

import { useState, useEffect } from "react";
import { RefreshCw, CalendarClock } from "lucide-react";

const FAMILLES_PRIORITAIRES = ["growth", "activity", "employment", "consumption"];
const COULEUR_FAMILLE_PRIORITAIRE = "#2563eb"; // bleu

function ordonnerFamillesLiees(famillesLiees) {
  const prioritaires = FAMILLES_PRIORITAIRES.filter((f) => famillesLiees.includes(f));
  const autres = famillesLiees.filter((f) => !FAMILLES_PRIORITAIRES.includes(f));
  return [...prioritaires, ...autres];
}

function LabelFamille({ nom }) {
  const estPrioritaire = FAMILLES_PRIORITAIRES.includes(nom);
  return (
    <span style={{ fontWeight: 700, color: estPrioritaire ? COULEUR_FAMILLE_PRIORITAIRE : "inherit" }}>
      {nom}
    </span>
  );
}

function BlocFamille({ nom, entrees }) {
  const vide = !entrees || entrees.length === 0;
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <LabelFamille nom={nom} />
      {vide ? (
        <div style={{ opacity: 0.6, fontStyle: "italic", marginTop: 4 }}>[vide]</div>
      ) : (
        <ul style={{ marginTop: 6, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
          {entrees.map((e, i) => (
            <li key={i} style={{ fontSize: 13.5 }}>
              <strong>{e.evenement}</strong> ({e.releaseDate}) — réel: {e.reel || "—"}, consensus: {e.consensus || "—"}, précédent: {e.precedent || "—"}
              {" — "}
              <span style={{ opacity: 0.75 }}>
                surprise: {e.comparaisons?.surprise}, évolution: {e.comparaisons?.evolution}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CarteEvenement({ evt, contextePartage }) {
  const pub = evt.publicationDuJour;
  const famillesOrdonnees = ordonnerFamillesLiees(evt.famillesLiees || []);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 18, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800 }}>
          {evt.devise} — {pub?.evenement}
        </h3>
        <span style={{ opacity: 0.6, fontSize: 12 }}>{pub?.releaseDate}</span>
      </div>

      <p style={{ fontSize: 13.5, marginTop: 6 }}>
        Réel: <strong>{pub?.reel || "—"}</strong> · Consensus: {pub?.consensus || "—"} · Précédent: {pub?.precedent || "—"}
        {" · "}
        Surprise: {pub?.comparaisons?.surprise} · Évolution: {pub?.comparaisons?.evolution}
      </p>

      {pub?.sensEconomiqueAttendu && (
        <p style={{ fontSize: 12.5, opacity: 0.7, marginTop: 6, fontStyle: "italic" }}>{pub.sensEconomiqueAttendu}</p>
      )}

      {evt.avertissement && (
        <p style={{ fontSize: 13, color: "#e6a700", marginTop: 8 }}>{evt.avertissement}</p>
      )}

      {famillesOrdonnees.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>Familles liées ({evt.devise}) :</p>
          {famillesOrdonnees.map((famille) => (
            <BlocFamille
              key={famille}
              nom={famille}
              entrees={contextePartage?.[famille]?.[evt.devise]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CalendrierConsolidePage() {
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [donnees, setDonnees] = useState(null);

  async function charger() {
    setLoading(true);
    setErreur(null);
    try {
      const res = await fetch("/api/calendrier-consolide/lire");
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

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <CalendarClock size={22} style={{ color: "var(--accent)" }} />
        <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 20, fontWeight: 800 }}>
          Calendrier BC — vue alignée par famille
        </h1>
      </div>
      <p style={{ opacity: 0.7, fontSize: 13, marginBottom: 20 }}>
        Lecture seule de calendrier-consolide.json du jour. Chaque publication est alignée avec ses familles liées
        (<span style={{ color: COULEUR_FAMILLE_PRIORITAIRE, fontWeight: 700 }}>growth → activity → employment → consumption</span>{" "}
        en priorité) ; une famille sans donnée affiche [vide].
      </p>

      <button
        onClick={charger}
        disabled={loading}
        style={{
          display: "flex", alignItems: "center", gap: 8, background: "var(--accent-blue-dark)", color: "#fff",
          border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, marginBottom: 24,
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
          <p style={{ fontWeight: 700, marginBottom: 16 }}>
            {donnees.count} publication(s) du jour — généré le {new Date(donnees.generatedAt).toLocaleString("fr-FR")}
          </p>
          {donnees.data.length === 0 && (
            <p style={{ opacity: 0.7 }}>Aucune publication du jour pour l'instant.</p>
          )}
          {donnees.data.map((evt) => (
            <CarteEvenement key={evt.eventId} evt={evt} contextePartage={donnees.contextePartage} />
          ))}
        </>
      )}

      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
