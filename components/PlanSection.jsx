"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getPlan, savePlan, defaultPlan } from "../lib/plan";
import ChecklistEditor from "./ChecklistEditor";

export default function PlanSection() {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState(defaultPlan());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    if (!open || !loading) return;
    getPlan().then((data) => {
      setPlan(data);
      setLoading(false);
    });
  }, [open]);

  function update(field, value) {
    setPlan((p) => ({ ...p, [field]: value }));
    setSavedAt(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await savePlan(plan);
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <p className="text-xs uppercase tracking-widest text-accent mb-1">Plan de trading</p>
          <p className="font-display text-ink">Tes règles, toujours à portée de main</p>
        </div>
        {open ? <ChevronUp size={18} className="text-muted" /> : <ChevronDown size={18} className="text-muted" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
          {loading ? (
            <p className="text-muted text-sm">Chargement...</p>
          ) : (
            <>
              <Field label="Règles générales">
                <textarea rows={3} value={plan.reglesGenerales} onChange={(e) => update("reglesGenerales", e.target.value)} className="input resize-none" />
              </Field>
              <Field label="Critères d'entrée">
                <textarea rows={3} value={plan.criteresEntree} onChange={(e) => update("criteresEntree", e.target.value)} className="input resize-none" />
              </Field>
              <Field label="Gestion du risque">
                <textarea rows={3} value={plan.gestionRisque} onChange={(e) => update("gestionRisque", e.target.value)} className="input resize-none" />
              </Field>
              <Field label="Checklist pré-trade">
                <ChecklistEditor items={plan.checklist} onChange={(items) => update("checklist", items)} />
              </Field>
              <div className="flex items-center gap-3">
                <button onClick={handleSave} disabled={saving} className="bg-accent text-bg font-medium px-4 py-1.5 rounded-md text-sm disabled:opacity-50">
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
                {savedAt && <span className="text-win text-xs">Enregistré à {savedAt.toLocaleTimeString("fr-FR")}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
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
