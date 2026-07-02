"use client";

import { useState } from "react";
import GoalForm from "../../components/GoalForm";
import GoalList from "../../components/GoalList";

export default function GoalsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-accent mb-1">Module</p>
        <h1 className="font-display text-3xl text-ink tracking-tight">Objectifs</h1>
        <p className="text-muted text-sm mt-1">Tes profits travaillent pour quelque chose de précis.</p>
      </header>

      <GoalForm onCreated={() => setRefreshKey((k) => k + 1)} />

      <section>
        <h2 className="font-display text-lg text-ink mb-3">Mes objectifs</h2>
        <GoalList key={refreshKey} />
      </section>
    </main>
  );
}
