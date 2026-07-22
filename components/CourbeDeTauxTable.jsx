"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * CourbeDeTauxTable.jsx
 * ------------------------------------------------------------------
 * A placer dans E:\trading-journal\components\CourbeDeTauxTable.jsx
 *
 * Reproduit le tableau TradingEconomics /bonds, groupé par région,
 * avec flèches colorées pour Chg et heatmap coloré pour Weekly/
 * Monthly/YTD/YoY (même esprit que ta capture d'écran).
 *
 * Consomme directement /api/bond-yield-curve (rapide, ~1-3s, car
 * cette route ne fait qu'UNE requête vers TE, contrairement à
 * bond-yields qui boucle sur 8 pages — pas besoin d'endpoint de
 * lecture séparé ici).
 */

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

function ChgArrow({ value }) {
  if (value === null || value === undefined) return <span>—</span>;
  const up = value >= 0;
  return (
    <span className={up ? "text-emerald-600" : "text-rose-600"}>
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(4)}
    </span>
  );
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
      const res = await fetch("/api/bond-yield-curve");
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

  // Regroupement par région, dans l'ordre d'apparition
  const regions = [];
  const parRegion = {};
  for (const item of data) {
    const region = item.region || "Autre";
    if (!parRegion[region]) {
      parRegion[region] = [];
      regions.push(region);
    }
    parRegion[region].push(item);
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Courbe de taux — G10</h2>
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

      {regions.map((region) => (
        <div key={region} className="mb-6 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 font-medium text-gray-500">{region}</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Yield</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Chg</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Weekly</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Monthly</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">YTD</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">YoY</th>
                <th className="text-right py-2 pl-3 font-medium text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody>
              {parRegion[region].map((item) => (
                <tr key={item.symbol} className="border-b border-gray-100">
                  <td className="py-2 pr-4 font-medium">{item.country}</td>
                  <td className="text-right py-2 px-3 tabular-nums">{item.yield?.toFixed(4) ?? "—"}</td>
                  <td className="text-right py-2 px-3 tabular-nums">
                    <ChgArrow value={item.chgDaily} />
                  </td>
                  <td className={`text-right py-2 px-3 tabular-nums ${heatmapClass(item.weekly)}`}>
                    {formatPercent(item.weekly)}
                  </td>
                  <td className={`text-right py-2 px-3 tabular-nums ${heatmapClass(item.monthly)}`}>
                    {formatPercent(item.monthly)}
                  </td>
                  <td className={`text-right py-2 px-3 tabular-nums ${heatmapClass(item.ytd)}`}>
                    {formatPercent(item.ytd)}
                  </td>
                  <td className={`text-right py-2 px-3 tabular-nums ${heatmapClass(item.yoy)}`}>
                    {formatPercent(item.yoy)}
                  </td>
                  <td className="text-right py-2 pl-3 text-gray-500">{item.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {!loading && data.length === 0 && !error && (
        <p className="text-gray-500 text-sm">Aucune donnée disponible.</p>
      )}
    </div>
  );
}
