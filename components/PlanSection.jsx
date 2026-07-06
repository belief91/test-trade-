"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getPlan, savePlan, defaultPlan } from "../lib/plan";
import ChecklistEditor from "./ChecklistEditor";

/**
 * Textarea qui s'agrandit automatiquement à la hauteur de son contenu réel
 * (jamais de scroll interne caché) — corrige le souci de "je ne vois presque
 * rien de mon plan" causé par l'ancienne hauteur figée à 3 lignes.
 */
function AutoGrowTextarea({ value, onChange }) {
  const ref = useRef(null);

  function resize(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 90)}px`;
  }

  useEffect(() => { resize(ref.current); }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => { onChange(e.target.value); resize(e.target); }}
      className="input"
      style={{ resize: "vertical", overflow: "hidden", lineHeight: 1.5 }}
    />
  );
}

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
    <div className="card">
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
                <AutoGrowTextarea value={plan.reglesGenerales} onChange={(v) => update("reglesGenerales", v)} />
              </Field>
              <Field label="Critères d'entrée">
                <AutoGrowTextarea value={plan.criteresEntree} onChange={(v) => update("criteresEntree", v)} />
              </Field>
              <Field label="Gestion du risque">
                <AutoGrowTextarea value={plan.gestionRisque} onChange={(v) => update("gestionRisque", v)} />
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
