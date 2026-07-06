"use client";

import { useState } from "react";
import { createGoal } from "../lib/goals";

const initialState = {
  title: "",
  targetAmount: "",
  priority: "Medium",
  profitAllocationPercentage: "",
};

export default function GoalForm({ onCreated }) {
  const [form, setForm] = useState(initialState);
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.targetAmount) return;
    setSubmitting(true);
    try {
      await createGoal({
        title: form.title,
        targetAmount: parseFloat(form.targetAmount),
        priority: form.priority,
        profitAllocationPercentage: form.profitAllocationPercentage
          ? parseFloat(form.profitAllocationPercentage)
          : 0,
      });
      setForm(initialState);
      onCreated?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-6 space-y-4">
      <h2 className="font-display text-lg text-ink">Nouvel objectif</h2>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Titre">
          <input
            type="text" required placeholder="ex: Fonds d'urgence"
            value={form.title} onChange={(e) => update("title", e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Montant cible ($)">
          <input
            type="number" step="any" required
            value={form.targetAmount} onChange={(e) => update("targetAmount", e.target.value)}
            className="input tabular"
          />
        </Field>
        <Field label="Priorité">
          <select value={form.priority} onChange={(e) => update("priority", e.target.value)} className="input">
            <option value="Low">Basse</option>
            <option value="Medium">Moyenne</option>
            <option value="High">Haute</option>
          </select>
        </Field>
        <Field label="% des profits alloué">
          <input
            type="number" step="any" min="0" max="100" placeholder="ex: 20"
            value={form.profitAllocationPercentage}
            onChange={(e) => update("profitAllocationPercentage", e.target.value)}
            className="input tabular"
          />
        </Field>
      </div>
      <p className="text-xs text-muted">
        Chaque trade manuel gagnant répartira automatiquement ce pourcentage de son P&L vers cet objectif.
      </p>
      <button type="submit" disabled={submitting} className="bg-accent text-bg font-medium px-5 py-2 rounded-md disabled:opacity-50">
        {submitting ? "Création..." : "Créer l'objectif"}
      </button>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
