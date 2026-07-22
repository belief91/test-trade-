"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * CourbeDeTauxTable.jsx
 * ------------------------------------------------------------------
 * A placer dans E:\trading-journal\components\CourbeDeTauxTable.jsx
 *
 * Consomme /api/bond-yields (2Y/5Y/10Y, 8 pays G10), groupé PAR PAYS
 * (pas par région TE) — chaque pays affiche ses 3 maturités ensemble,
 * triées 2Y -> 5Y -> 10Y.
 *
 * Champs disponibles depuis bond-yields (différents de bond-yield-curve) :
 * dayChgPercent / monthChgPercent / yearChgPercent (pas de weekly/ytd/yoy).
 */

const ORDRE_MATURITE = { "2Y": 1, "5Y": 2, "10Y": 3 };

function formatPercent(value) {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function heatmapClass(value) {
  if (value === null || value === undefined) return "";
  if (value > 0) return "bg-emerald-100 text-emerald-800";
  if (value < 0) return "bg-rose-100 text-rose-800";
  return "";
}

export default function CourbeDeTauxTable() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bond-yields");
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Erreur inconnue");
      setData(json.data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  // Regroupement PAR PAYS, maturités triées 2Y -> 5Y -> 10Y à l'intérieur
  const pays = [];
  const parPays = {};
  for (const item of data) {
    const key = item.country;
    if (!parPays[key]) {
      parPays[key] = [];
      pays.push(key);
    }
    parPays[key].push(item);
  }
  for (const key of pays) {
    parPays[key].sort((a, b) => (ORDRE_MATURITE[a.maturity] ?? 99) - (ORDRE_MATURITE[b.maturity] ?? 99));
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Courbe de taux — G10 (2Y / 5Y / 10Y)</h2>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-500">
              Mis à jour : {lastUpdated.toLocaleTimeString("fr-FR")}
            </span>
          )}
          <button
            onClick={charger}
            disabled={loading}
            className="px-3 py-1.5 text-sm rounded-md bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Chargement..." : "Recharger"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-rose-50 text-rose-700 text-sm">
          Erreur : {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pr-4 font-medium text-gray-500">Pays</th>
              <th className="text-left py-2 px-3 font-medium text-gray-500">Maturité</th>
              <th className="text-right py-2 px-3 font-medium text-gray-500">Yield</th>
              <th className="text-right py-2 px-3 font-medium text-gray-500">Day</th>
              <th className="text-right py-2 px-3 font-medium text-gray-500">Month</th>
              <th className="text-right py-2 px-3 font-medium text-gray-500">Year</th>
              <th className="text-right py-2 pl-3 font-medium text-gray-500">Date</th>
            </tr>
          </thead>
          <tbody>
            {pays.map((country) =>
              parPays[country].map((item, idx) => (
                <tr
                  key={`${item.currency}-${item.maturity}`}
                  className={`border-b border-gray-100 ${idx === 0 ? "border-t-2 border-t-gray-300" : ""}`}
                >
                  <td className="py-2 pr-4 font-medium">
                    {idx === 0 ? `${item.country} (${item.currency})` : ""}
                  </td>
                  <td className="py-2 px-3 text-gray-600">{item.maturity}</td>
                  <td className="text-right py-2 px-3 tabular-nums">{item.yield?.toFixed(3) ?? "—"}</td>
                  <td className={`text-right py-2 px-3 tabular-nums ${heatmapClass(item.dayChgPercent)}`}>
                    {formatPercent(item.dayChgPercent)}
                  </td>
                  <td className={`text-right py-2 px-3 tabular-nums ${heatmapClass(item.monthChgPercent)}`}>
                    {formatPercent(item.monthChgPercent)}
                  </td>
                  <td className={`text-right py-2 px-3 tabular-nums ${heatmapClass(item.yearChgPercent)}`}>
                    {formatPercent(item.yearChgPercent)}
                  </td>
                  <td className="text-right py-2 pl-3 text-gray-500">{item.date}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && data.length === 0 && !error && (
        <p className="text-gray-500 text-sm">Aucune donnée disponible.</p>
      )}
    </div>
  );
}
