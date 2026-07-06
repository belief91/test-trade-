"use client";

import { useEffect, useMemo, useState } from "react";
import { createTrade, computeResultFromPrices, resultFromPL } from "../lib/trades";
import { getPlan } from "../lib/plan";
import { allocateProfitToGoals } from "../lib/goals";
import { SYMBOLES, SYMBOLES_FLAT } from "../lib/symbols";
import { calculatePositionSize, isForexPair, isUsdQuoted, isUsdBase, pipsFromPrices } from "../lib/positionSize";
import { broadcastSymbol } from "../lib/symbolSync";

const initialState = {
  date: new Date().toISOString().slice(0, 10),
  paire: SYMBOLES_FLAT[0],
  direction: "long",
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

  // Panneau de calcul en direct (taille de position) — non sauvegardé sur le trade,
  // juste une aide au moment de la saisie.
  const [solde, setSolde] = useState("");
  const [risquePct, setRisquePct] = useState("1");
  const [risqueFixe, setRisqueFixe] = useState("");
  const [pipValueManuel, setPipValueManuel] = useState("");

  // La valeur du pip saisie manuellement n'a de sens que pour un symbole
  // donné — on la vide si la paire change, pour éviter d'appliquer par erreur
  // la valeur d'une autre paire.
  useEffect(() => { setPipValueManuel(""); }, [form.paire]);

  useEffect(() => {
    getPlan().then((p) => setChecklistItems(p.checklist || []));
  }, []);

  // Propage la paire tradée vers le module Calculatrice (même onglet ou onglet séparé)
  useEffect(() => {
    broadcastSymbol(form.paire);
  }, [form.paire]);

  function update(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function toggleCheck(id) { setChecked((c) => ({ ...c, [id]: !c[id] })); }

  const forexOk = isForexPair(form.paire);
  const usdQuote = isUsdQuoted(form.paire);
  const usdBase = isUsdBase(form.paire);
  const autoOk = usdQuote || (usdBase && form.entry);
  const slPips = useMemo(() => pipsFromPrices(form.entry, form.sl, form.paire), [form.entry, form.sl, form.paire]);
  const tpPips = useMemo(() => pipsFromPrices(form.entry, form.tp, form.paire), [form.entry, form.tp, form.paire]);

  const liveCalc = useMemo(() => {
    if (!forexOk || slPips == null || slPips <= 0) return null;
    return calculatePositionSize({
      soldeCompte: solde,
      risquePourcentage: risqueFixe ? null : risquePct,
      risqueMontant: risqueFixe,
      slPips,
      tpPips,
      pipValueOverride: pipValueManuel,
      entryPrice: form.entry,
      symbol: form.paire,
    });
  }, [forexOk, slPips, tpPips, solde, risquePct, risqueFixe, pipValueManuel, form.entry, form.paire]);

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
        date: form.date, paire: form.paire, direction: form.direction,
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
        <F label="Setup" style={{ gridColumn: "span 2" }}>
          <input type="text" placeholder="Ton setup personnel" value={form.setup} onChange={(e) => update("setup", e.target.value)} className="input" />
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

          {/* Panneau de calcul en direct — pips + valeur en $ + taille de position */}
          {(form.entry && form.sl) && (
            <div style={{ marginTop: 14, background: "var(--raised)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 10 }}>
                Calcul en direct
              </p>

              {!forexOk ? (
                <p style={{ fontSize: 12, color: "var(--muted)" }}>
                  {form.paire} n'est pas une paire Forex standard — le calcul automatique des pips
                  n'est pas fiable ici. Utilise le module <strong style={{ color: "var(--accent)" }}>Calculatrice</strong> avec
                  une valeur de pip manuelle.
                </p>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: autoOk ? "repeat(3, 1fr)" : "repeat(4, 1fr)", gap: 10, marginBottom: 10 }}>
                    <F label="Solde du compte ($)">
                      <input type="number" step="any" value={solde} onChange={(e) => setSolde(e.target.value)} className="input tabular" placeholder="ex: 10000" />
                    </F>
                    <F label="Risque (%)">
                      <input type="number" step="any" value={risquePct} disabled={!!risqueFixe} onChange={(e) => setRisquePct(e.target.value)} className="input tabular" />
                    </F>
                    <F label="OU risque fixe ($)">
                      <input type="number" step="any" value={risqueFixe} onChange={(e) => setRisqueFixe(e.target.value)} className="input tabular" placeholder="optionnel" />
                    </F>
                    {!autoOk && (
                      <F label="Valeur du pip ($) — requis">
                        <input type="number" step="any" value={pipValueManuel} onChange={(e) => setPipValueManuel(e.target.value)} className="input tabular" placeholder="voir ta plateforme" />
                      </F>
                    )}
                  </div>

                  {usdBase && !form.entry && (
                    <p style={{ fontSize: 11, color: "var(--accent)", marginBottom: 10 }}>
                      {form.paire} peut se calculer automatiquement (le $ est la devise de base) — remplis le
                      prix d'entrée ci-dessus pour qu'il serve de taux de change.
                    </p>
                  )}
                  {!usdQuote && !usdBase && (
                    <p style={{ fontSize: 11, color: "var(--accent)", marginBottom: 10 }}>
                      {form.paire} est une paire croisée sans $ en base ni en cotation — aucune donnée du
                      formulaire ne permet de déduire le taux. Renseigne la valeur du pip affichée sur ta
                      plateforme (MT4/MT5/cTrader, pour cette paire et cette taille de lot).
                    </p>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                    <MiniResult label="SL en pips" value={slPips != null ? slPips.toFixed(1) : "—"} />
                    <MiniResult label="TP en pips" value={tpPips != null ? tpPips.toFixed(1) : "—"} />
                    <MiniResult label="Montant risqué" value={liveCalc?.result ? `${liveCalc.result.montantRisque}$` : "—"} />
                    <MiniResult label="Taille (lots)" value={liveCalc?.result ? liveCalc.result.tailleLots : "—"} accent />
                  </div>

                  {autoOk && liveCalc?.errors?.length > 0 && (
                    <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                      Renseigne le solde du compte pour voir la taille de position.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
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

function MiniResult({ label, value, accent }) {
  return (
    <div>
      <p style={{ fontSize: 9, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</p>
      <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 14, fontWeight: 700, color: accent ? "var(--accent)" : "var(--ink)" }}>{value}</p>
    </div>
  );
}
