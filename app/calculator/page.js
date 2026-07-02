"use client";

import { useState } from "react";
import { Calculator, AlertTriangle, Info } from "lucide-react";
import { calculatePositionSize, isForexPair } from "../../lib/positionSize";
import { SYMBOLES } from "../../lib/symbols";

export default function CalculatorPage() {
  const [form, setForm] = useState({
    symbol: "EUR/USD", soldeCompte: "", risquePourcentage: "1",
    risqueMontant: "", slPips: "", tpPips: "",
    tailleLot: "100000", pipValueOverride: "",
  });
  const [output, setOutput] = useState(null);

  const update = (k, v) => { setForm(f => ({ ...f, [k]: v })); setOutput(null); };
  const needsManualPip = !isForexPair(form.symbol);

  function calc() {
    setOutput(calculatePositionSize({
      soldeCompte: form.soldeCompte,
      risquePourcentage: form.risqueMontant ? null : form.risquePourcentage,
      risqueMontant: form.risqueMontant,
      slPips: form.slPips, tpPips: form.tpPips,
      tailleLot: form.tailleLot,
      pipValueOverride: form.pipValueOverride,
      symbol: form.symbol,
    }));
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "36px 20px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <p className="section-label">Module</p>
        <h1 style={{ fontSize: 28, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, color: "var(--ink)", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <Calculator size={24} style={{ color: "var(--accent)" }} /> Calculatrice de position
        </h1>
        <p style={{ color: "var(--sub)", fontSize: 13, marginTop: 4 }}>Calcule ta taille de lot exacte — évite un risque déséquilibré.</p>
      </div>

      <div className="card card-p" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Symbole">
            <select value={form.symbol} onChange={e => update("symbol", e.target.value)} className="input">
              {Object.entries(SYMBOLES).map(([g, items]) => (
                <optgroup key={g} label={g}>{items.map(s => <option key={s} value={s}>{s}</option>)}</optgroup>
              ))}
            </select>
          </Field>
          <Field label="Solde du compte ($)">
            <input type="number" step="any" value={form.soldeCompte} onChange={e => update("soldeCompte", e.target.value)} className="input" placeholder="ex: 10000" />
          </Field>
          <Field label="Risque (% du solde)">
            <input type="number" step="any" value={form.risquePourcentage} disabled={!!form.risqueMontant} onChange={e => update("risquePourcentage", e.target.value)} className="input" />
          </Field>
          <Field label="OU montant fixe risqué ($)">
            <input type="number" step="any" value={form.risqueMontant} onChange={e => update("risqueMontant", e.target.value)} className="input" placeholder="optionnel" />
          </Field>
          <Field label="Stop Loss (pips)">
            <input type="number" step="any" value={form.slPips} onChange={e => update("slPips", e.target.value)} className="input" />
          </Field>
          <Field label="Take Profit (pips)">
            <input type="number" step="any" value={form.tpPips} onChange={e => update("tpPips", e.target.value)} className="input" placeholder="optionnel" />
          </Field>
          <Field label="Taille du lot (unités)">
            <input type="number" step="any" value={form.tailleLot} onChange={e => update("tailleLot", e.target.value)} className="input" />
          </Field>
          <Field label={needsManualPip ? "★ Valeur du pip ($) — requis" : "Valeur du pip — override"}>
            <input type="number" step="any" value={form.pipValueOverride} onChange={e => update("pipValueOverride", e.target.value)} className="input" placeholder={needsManualPip ? "voir ta plateforme broker" : "auto"} />
          </Field>
        </div>

        {needsManualPip && (
          <div style={{ display: "flex", gap: 8, background: "rgba(240,165,0,0.07)", border: "1px solid rgba(240,165,0,0.2)", borderRadius: 8, padding: "10px 12px" }}>
            <AlertTriangle size={14} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: "var(--sub)", lineHeight: 1.5 }}>
              Ce symbole n'est pas une paire Forex standard. La valeur du pip dépend des specs de contrat de ton broker — renseigne-la manuellement depuis ta plateforme pour un calcul fiable.
            </p>
          </div>
        )}

        <button onClick={calc} className="btn-primary" style={{ alignSelf: "flex-start" }}>
          <Calculator size={14} /> Calculer
        </button>

        {output?.errors?.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {output.errors.map((e, i) => <p key={i} style={{ fontSize: 12, color: "var(--loss)" }}>{e}</p>)}
          </div>
        )}

        {output?.result && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            <ResultBlock label="Taille en lots" value={`${output.result.tailleLots} lot${output.result.tailleLots !== 1 ? "s" : ""}`} big accent />
            <ResultBlock label="Taille en unités" value={output.result.tailleUnites.toLocaleString("fr-FR")} big />
            <ResultBlock label="Montant risqué" value={`${output.result.montantRisque}$`} />
            <ResultBlock label="Ratio R:R" value={output.result.ratioRR ? `1:${output.result.ratioRR}` : "—"} />
            <ResultBlock label={`Valeur du pip (${output.result.pipValueSource})`} value={`${output.result.pipValue}$`} />
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, background: "var(--raised)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
        <Info size={14} style={{ color: "var(--muted)", flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
          Calcul précis pour les paires Forex standards (compte en USD). Pour les indices, l'or ou les matières premières, renseigne toujours la valeur du pip manuellement depuis ta plateforme.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--sub)", marginBottom: 5, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}

function ResultBlock({ label, value, big, accent }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{label}</p>
      <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: big ? 22 : 14, fontWeight: big ? 700 : 500, color: accent ? "var(--accent)" : "var(--ink)" }}>{value}</p>
    </div>
  );
}
