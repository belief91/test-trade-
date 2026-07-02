"use client";

import { useState } from "react";
import { createBroker } from "../lib/brokers";

const TYPES = ["Funded", "Demo", "Personal"];

const initialState = {
  nom: "",
  type: TYPES[0],
  identifiant: "",
  plateforme: "",
  notes: "",
};

export default function BrokerForm({ onCreated }) {
  const [form, setForm] = useState(initialState);
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nom.trim()) return;
    setSubmitting(true);
    try {
      await createBroker(form);
      setForm(initialState);
      onCreated?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-6 space-y-4">
      <h2 className="font-display text-lg text-ink">Ajouter un compte broker</h2>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Nom du broker">
          <input
            type="text" required placeholder="ex: IC Markets, FTMO..."
            value={form.nom} onChange={(e) => update("nom", e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Type de compte">
          <select value={form.type} onChange={(e) => update("type", e.target.value)} className="input">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Identifiant / login">
          <input
            type="text" placeholder="email ou numéro de compte"
            value={form.identifiant} onChange={(e) => update("identifiant", e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Plateforme / lien">
          <input
            type="text" placeholder="ex: MT5, ctrader.com/..."
            value={form.plateforme} onChange={(e) => update("plateforme", e.target.value)}
            className="input"
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          rows={3}
          value={form.notes} onChange={(e) => update("notes", e.target.value)}
          className="input resize-none"
          placeholder="Règles du compte, échéances, particularités..."
        />
      </Field>

      <p className="text-xs text-muted">
        ⚠️ Ce champ n'est pas chiffré — évite d'y mettre ton vrai mot de passe. Utilise plutôt
        un gestionnaire de mots de passe, et garde ici juste de quoi te souvenir du compte.
      </p>

      <button type="submit" disabled={submitting} className="bg-accent text-bg font-medium px-5 py-2 rounded-md disabled:opacity-50">
        {submitting ? "Enregistrement..." : "Ajouter le compte"}
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
