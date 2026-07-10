"use client";
// Obligatoire dans l'App Router : ce composant charge des données après
// l'affichage de la page (useEffect/useState), donc il doit tourner
// dans le navigateur de l'utilisateur, pas seulement sur le serveur.

import { useEffect, useState } from "react";

// Composant tableau COT TFF - Dealer / Asset Manager / Leveraged Money
// A intégrer dans ton dashboard BELIEFX (page /cot ou composant dédié)

const CATEGORIES = [
  { key: "dealer", label: "Dealer Positions" },
  { key: "assetMgr", label: "Asset Manager Positions" },
  { key: "levMoney", label: "Leveraged Money Positions" },
];

function formatNombre(n) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("fr-FR");
}

function CelluleNet({ valeur }) {
  if (valeur === null || valeur === undefined) return <td className="cot-cell">—</td>;
  const couleur = valeur >= 0 ? "#16a34a" : "#dc2626"; // vert / rouge, comme ta capture
  return (
    <td className="cot-cell" style={{ color: couleur, fontWeight: 600 }}>
      {valeur >= 0 ? "" : ""}{formatNombre(valeur)}
    </td>
  );
}

export default function CotTffTable() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    async function charger() {
      try {
        const res = await fetch("/api/cot");
        if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        setErreur(err.message);
      } finally {
        setLoading(false);
      }
    }
    charger();
  }, []);

  if (loading) return <p style={{ padding: 24 }}>Chargement des données COT...</p>;
  if (erreur) return <p style={{ padding: 24, color: "#dc2626" }}>Erreur : {erreur}</p>;

  return (
    <div className="cot-wrapper">
      <h2 className="cot-titre">Rapport COT Complet - Toutes Catégories</h2>
      <p className="cot-sous-titre">Positions des Dealers, Asset Managers et Leveraged Funds</p>

      <div className="cot-table-scroll">
        <table className="cot-table">
          <thead>
            <tr>
              <th rowSpan={2}>CONTRACT<br />MARKET_NAME</th>
              <th rowSpan={2}>Report_Date</th>
              <th rowSpan={2}>Open_Interest_All</th>
              {CATEGORIES.map((cat) => (
                <th key={cat.key} colSpan={5} className="cot-header-groupe">{cat.label}</th>
              ))}
            </tr>
            <tr>
              {CATEGORIES.map((cat) => (
                <>
                  <th key={cat.key + "-long"}>Long_All</th>
                  <th key={cat.key + "-short"}>Short_All</th>
                  <th key={cat.key + "-spread"}>Spread_All</th>
                  <th key={cat.key + "-net"}>NET</th>
                  <th key={cat.key + "-pctnet"}>% NET</th>
                </>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((ligne) => (
              <tr key={ligne.currency}>
                <td className="cot-cell cot-devise">{ligne.currency}</td>
                <td className="cot-cell">{ligne.reportDate}</td>
                <td className="cot-cell">{formatNombre(ligne.openInterest)}</td>
                {CATEGORIES.map((cat) => {
                  const c = ligne[cat.key];
                  return (
                    <>
                      <td className="cot-cell" style={{ color: "#16a34a" }}>{formatNombre(c.long)}</td>
                      <td className="cot-cell" style={{ color: "#dc2626" }}>{formatNombre(c.short)}</td>
                      <td className="cot-cell" style={{ color: "#2563eb" }}>{formatNombre(c.spread)}</td>
                      <CelluleNet valeur={c.net} />
                      <td className="cot-cell">{c.pctNet !== null ? `${c.pctNet}%` : "—"}</td>
                    </>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .cot-wrapper {
          background: #fff;
          border-radius: 12px;
          padding: 24px;
          border: 1px solid #e5e7eb;
        }
        .cot-titre {
          font-size: 20px;
          font-weight: 700;
          color: #1f2937;
          margin: 0 0 4px 0;
        }
        .cot-sous-titre {
          color: #6b7280;
          font-size: 14px;
          margin: 0 0 20px 0;
        }
        .cot-table-scroll {
          overflow-x: auto;
        }
        .cot-table {
          border-collapse: collapse;
          width: 100%;
          font-size: 13px;
          white-space: nowrap;
        }
        .cot-table th {
          background: #f3e8ff;
          color: #4c1d95;
          padding: 8px 12px;
          text-align: right;
          font-weight: 600;
          border: 1px solid #e5e7eb;
        }
        .cot-table th:first-child,
        .cot-table th:nth-child(2) {
          text-align: left;
        }
        .cot-header-groupe {
          background: #ede9fe;
        }
        .cot-cell {
          padding: 8px 12px;
          text-align: right;
          border: 1px solid #f0f0f0;
        }
        .cot-devise {
          font-weight: 700;
          text-align: left;
        }
      `}</style>
    </div>
  );
}
