"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function RRHistogram({ data }) {
  const hasData = data.some((d) => d.count > 0);

  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <p className="text-xs uppercase tracking-widest text-accent mb-4">Distribution Risk/Reward</p>
      {!hasData ? (
        <p className="text-muted text-xs">Aucun trade en saisie manuelle avec ratio R:R renseigné.</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <XAxis dataKey="label" stroke="#9A9CA3" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#9A9CA3" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "#23262E", border: "1px solid #2E323C", borderRadius: 6 }} labelStyle={{ color: "#E8E6E1" }} />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill="#D4A24E" />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
