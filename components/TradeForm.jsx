"use client";

import { useEffect, useState } from "react";
import { createTrade, computeResultFromPrices, resultFromPL } from "../lib/trades";
import { getPlan } from "../lib/plan";
import { allocateProfitToGoals } from "../lib/goals";
import { SYMBOLES, SYMBOLES_FLAT } from "../lib/symbols";

const COMPTES = ["Funded", "Demo", "Personal"];

const initialState = {
  date: new Date().toISOString().slice(0, 10),
  paire: SYMBOLES_FLAT[0],
  direction: "long",
  account: COMPTES[0],
  setup: "",
  notes: "",
  entry: "",
  sl: "",
  tp: "",
  exit: "",
  profitLoss: "",
  riskReward: "",
  resultManuel: "",
};

export default function TradeForm({ onCreated }) {
  const [form, setForm] = useState(initialState);
  const [modeManuel, setModeManuel] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [checklistItems, setChecklistItems] = useState([]);
  const [checked, setChecked] = useState({});

  useEffect(() => {
    getPlan().then((p) => setChecklistItems(p.checklist || []));
  }, []);

  function update(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function toggleCheck(id) { setChecked((c) => ({ ...c, [id]: !c[id] })); }

  function buildResult() {
    if (modeManuel) {
      const pl = form.profitLoss === "" ? null : parseFloat(form.profitLoss);
      const rr = form.riskReward === "" ? null : parseFloat(form.riskReward);
      const result = form.resultManuel || resultFromPL(pl) || null;
      return { profitLoss: pl, riskReward: rr, result, isManual: true };
    }
    const calc = computeResultFromPrices(form);
    if (!calc) return { profitLoss: null, riskReward: null, result: null, isManual: false };
    return { profitLoss: parseFloat(calc.pct.toFixed(2)), riskReward: null, result: resultFromPL(calc.pct), isManual: false };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { profitLoss, riskReward, result, isManual } = buildResult();
      const checklistScore = checklistItems.length > 0
        ? (Object.values(checked).filter(Boolean).length / checklistItems.length) * 100
        : null;

      await createTrade({
        date: form.date, paire: form.paire, direction: form.direction, account: form.account,
        setup: form.setup, notes: form.notes,
        entry: form.entry ? parseFloat(form.entry) : null,
        sl: form.sl ? parseFloat(form.sl) : null,
        tp: form.tp ? parseFloat(form.tp) : null,
        exit: form.exit ? parseFloat(form.exit) : null,
        profitLoss, riskReward, result, isManualResult: isManual, checklistScore,
      });

      if (isManual && profitLoss != null && profitLoss > 0) await allocateProfitToGoals(profitLoss);

      setForm(initialState);
      setChecked({});
      onCreated?.();
    } catch (err) {
      setError("L'enregistrement a échoué : " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card card-p" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 16, fontWeight: 600, color: "var(--ink)", margin: 0 }}>Nouveau trade</h2>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--sub)", cursor: "pointer" }}>
          <input type="checkbox" checked={modeManuel} onChange={(e) => setModeManuel(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
          Saisie manuelle du résultat
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
        <F label="Date"><input type="date" required value={form.date} onChange={(e) => update("date", e.target.value)} className="input" /></F>
        <F label="Paire">
          <select value={form.paire} onChange={(e) => update("paire", e.target.value)} className="input">
            {Object.entries(SYMBOLES).map(([g, items]) => (
              <optgroup key={g} label={g}>{items.map((p) => <option key={p} value={p}>{p}</option>)}</optgroup>
            ))}
          </select>
        </F>
        <F label="Direction">
          <select value={form.direction} onChange={(e) => update("direction", e.target.value)} className="input">
            <option value="long">Long ↑</option>
            <option value="short">Short ↓</option>
          </select>
        </F>
        <F label="Compte">
          <select value={form.account} onChange={(e) => update("account", e.target.value)} className="input">
            {COMPTES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </F>
        <F label="Setup" style={{ gridColumn: "span 2" }}>
          <input type="text" placeholder="ex: Kill Zone Londres" value={form.setup} onChange={(e) => update("setup", e.target.value)} className="input" />
        </F>
      </div>

      <hr className="divider" />

      {!modeManuel ? (
        <div>
          <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>Prix (optionnels) — le résultat est calculé automatiquement si entrée + sortie sont remplis.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <F label="Entrée"><input type="number" step="any" value={form.entry} onChange={(e) => update("entry", e.target.value)} className="input tabular" /></F>
            <F label="Stop loss"><input type="number" step="any" value={form.sl} onChange={(e) => update("sl", e.target.value)} className="input tabular" /></F>
            <F label="Take profit"><input type="number" step="any" value={form.tp} onChange={(e) => update("tp", e.target.value)} className="input tabular" /></F>
            <F label="Sortie"><input type="number" step="any" value={form.exit} onChange={(e) => update("exit", e.target.value)} className="input tabular" /></F>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>Résultat saisi manuellement.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <F label="P&L ($)"><input type="number" step="any" value={form.profitLoss} onChange={(e) => update("profitLoss", e.target.value)} className="input tabular" /></F>
            <F label="Risk/Reward (R)"><input type="number" step="any" value={form.riskReward} onChange={(e) => update("riskReward", e.target.value)} className="input tabular" /></F>
            <F label="Résultat">
              <select value={form.resultManuel} onChange={(e) => update("resultManuel", e.target.value)} className="input">
                <option value="">Auto (selon P&L)</option>
                <option value="Win">✓ Win</option>
                <option value="Loss">✗ Loss</option>
                <option value="Breakeven">= Breakeven</option>
              </select>
            </F>
          </div>
        </div>
      )}

      <F label="Notes / émotions">
        <textarea rows={2} value={form.notes} onChange={(e) => update("notes", e.target.value)} className="input" style={{ resize: "none" }} placeholder="Contexte, ressenti, erreurs à corriger..." />
      </F>

      {checklistItems.length > 0 && (
        <div style={{ background: "var(--raised)", borderRadius: 8, padding: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 }}>
            Checklist — {Object.values(checked).filter(Boolean).length}/{checklistItems.length}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {checklistItems.map((item) => (
              <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink)", cursor: "pointer" }}>
                <input type="checkbox" checked={!!checked[item.id]} onChange={() => toggleCheck(item.id)} style={{ accentColor: "var(--accent)" }} />
                {item.text}
              </label>
            ))}
          </div>
        </div>
      )}

      <p style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
        📎 Les captures avant/après se gèrent désormais dans le module <strong style={{ color: "var(--accent)" }}>Screenshots</strong>, indépendamment de ce trade.
      </p>

      {error && <p style={{ fontSize: 12, color: "var(--loss)" }}>{error}</p>}

      <button type="submit" disabled={submitting} className="btn-primary" style={{ alignSelf: "flex-start" }}>
        {submitting ? "Enregistrement…" : "Enregistrer le trade"}
      </button>
    </form>
  );
}

function F({ label, children, style }) {
  return (
    <label style={{ display: "block", ...style }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--sub)", marginBottom: 5, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}
