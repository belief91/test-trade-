"use client";

import { useEffect, useState } from "react";
import { getReview, saveReview, weekStartId, listenToReviews } from "../../lib/weeklyReview";

export default function ReviewPage() {
  const weekId = weekStartId();
  const [form, setForm] = useState({ ceQuiAMarche: "", ceQuiNaPasMarche: "", ameliorations: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [past, setPast] = useState([]);

  useEffect(() => {
    getReview(weekId).then((data) => {
      setForm(data);
      setLoading(false);
    });
  }, [weekId]);

  useEffect(() => {
    const unsubscribe = listenToReviews(setPast);
    return unsubscribe;
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setSavedAt(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveReview(weekId, form);
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="max-w-3xl mx-auto px-4 py-10"><p className="text-muted text-sm animate-pulse">Chargement...</p></main>;
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-accent mb-1">Module</p>
        <h1 className="font-display text-3xl text-ink tracking-tight">Revue hebdomadaire</h1>
        <p className="text-muted text-sm mt-1">Semaine du {weekId} — à remplir chaque dimanche.</p>
      </header>

      <Section title="Ce qui a marché">
        <textarea rows={4} value={form.ceQuiAMarche} onChange={(e) => update("ceQuiAMarche", e.target.value)} className="input resize-none" placeholder="Les trades, décisions ou habitudes qui ont payé cette semaine." />
      </Section>

      <Section title="Ce qui n'a pas marché">
        <textarea rows={4} value={form.ceQuiNaPasMarche} onChange={(e) => update("ceQuiNaPasMarche", e.target.value)} className="input resize-none" placeholder="Erreurs, écarts par rapport au plan, émotions mal gérées." />
      </Section>

      <Section title="Ce que je change la semaine prochaine">
        <textarea rows={4} value={form.ameliorations} onChange={(e) => update("ameliorations", e.target.value)} className="input resize-none" placeholder="Une ou deux choses concrètes à ajuster." />
      </Section>

      <div className="flex items-center gap-4">
        <button onClick={handleSave} disabled={saving} className="bg-accent text-bg font-medium px-5 py-2 rounded-md disabled:opacity-50">
          {saving ? "Enregistrement..." : "Enregistrer la revue"}
        </button>
        {savedAt && <span className="text-win text-xs">Enregistré à {savedAt.toLocaleTimeString("fr-FR")}</span>}
      </div>

      {past.length > 1 && (
        <section className="space-y-2 border-t border-border pt-6">
          <h2 className="font-display text-lg text-ink mb-2">Revues précédentes</h2>
          {past.filter((r) => r.id !== weekId).map((r) => (
            <details key={r.id} className="border border-border rounded-md p-3">
              <summary className="text-sm text-ink cursor-pointer">Semaine du {r.id}</summary>
              <div className="mt-2 space-y-2 text-sm text-muted">
                {r.ceQuiAMarche && <p><span className="text-win">+ </span>{r.ceQuiAMarche}</p>}
                {r.ceQuiNaPasMarche && <p><span className="text-loss">− </span>{r.ceQuiNaPasMarche}</p>}
                {r.ameliorations && <p><span className="text-accent">→ </span>{r.ameliorations}</p>}
              </div>
            </details>
          ))}
        </section>
      )}
    </main>
  );
}

function Section({ title, children }) {
  return (
    <section className="bg-surface border border-border rounded-lg p-6 space-y-3">
      <h2 className="font-display text-lg text-ink">{title}</h2>
      {children}
    </section>
  );
}
