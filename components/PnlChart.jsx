"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

export default function PnlChart({ data }) {
  if (data.length === 0) {
    return (
      <p className="text-muted text-sm border border-border rounded-md p-6 text-center">
        Pas encore de trade en saisie manuelle ($) ce mois-ci pour tracer le graphique.
      </p>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <p className="text-xs uppercase tracking-widest text-accent mb-4">P&L journalier — mois en cours</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2E323C" vertical={false} />
          <XAxis dataKey="date" stroke="#9A9CA3" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#9A9CA3" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: "#23262E", border: "1px solid #2E323C", borderRadius: 6 }}
            labelStyle={{ color: "#E8E6E1" }}
            formatter={(value) => [`${value}$`, "P&L"]}
          />
          <Bar dataKey="pl" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.pl >= 0 ? "#4F9D8D" : "#C1554A"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
