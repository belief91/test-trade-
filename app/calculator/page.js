"use client";

import { useEffect, useState } from "react";
import { Calculator, AlertTriangle, Info } from "lucide-react";
import { calculatePositionSize, isUsdQuoted, isUsdBase } from "../../lib/positionSize";
import { SYMBOLES } from "../../lib/symbols";
import { getLastSymbol, subscribeToSymbol } from "../../lib/symbolSync";

export default function CalculatorPage() {
  const [form, setForm] = useState({
    symbol: "EUR/USD", soldeCompte: "", risquePourcentage: "1",
    risqueMontant: "", slPips: "", tpPips: "",
    tailleLot: "100000", pipValueOverride: "", prixActuel: "",
  });
  const [output, setOutput] = useState(null);

  useEffect(() => {
    const last = getLastSymbol();
    if (last) setForm((f) => ({ ...f, symbol: last }));
    const unsub = subscribeToSymbol((symbol) => setForm((f) => ({ ...f, symbol })));
    return unsub;
  }, []);

  const update = (k, v) => { setForm(f => ({ ...f, [k]: v })); setOutput(null); };
  const usdQuote = isUsdQuoted(form.symbol);
  const usdBase = isUsdBase(form.symbol);
  const autoOk = usdQuote || (usdBase && form.prixActuel);
  const needsManualPip = !autoOk;

  function calc() {
    setOutput(calculatePositionSize({
      soldeCompte: form.soldeCompte,
      risquePourcentage: form.risqueMontant ? null : form.risquePourcentage,
      risqueMontant: form.risqueMontant,
      slPips: form.slPips, tpPips: form.tpPips,
      tailleLot: form.tailleLot,
      pipValueOverride: form.pipValueOverride,
      entryPrice: form.prixActuel,
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
          {usdBase && (
            <Field label="Prix actuel (sert de taux de change)">
              <input type="number" step="any" value={form.prixActuel} onChange={e => update("prixActuel", e.target.value)} className="input" placeholder="ex: 1.3600" />
            </Field>
          )}
          <Field label={needsManualPip ? "★ Valeur du pip ($) — requis" : "Valeur du pip — override"}>
            <input type="number" step="any" value={form.pipValueOverride} onChange={e => update("pipValueOverride", e.target.value)} className="input" placeholder={needsManualPip ? "voir ta plateforme broker" : "auto"} />
          </Field>
        </div>

        {usdBase && !form.prixActuel && (
          <div style={{ display: "flex", gap: 8, background: "rgba(240,165,0,0.07)", border: "1px solid rgba(240,165,0,0.2)", borderRadius: 8, padding: "10px 12px" }}>
            <AlertTriangle size={14} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: "var(--sub)", lineHeight: 1.5 }}>
              {form.symbol} peut être calculé automatiquement (le $ est la devise de base) — remplis le
              "Prix actuel" ci-dessus, il servira de taux de change.
            </p>
          </div>
        )}
        {!usdQuote && !usdBase && (
          <div style={{ display: "flex", gap: 8, background: "rgba(240,165,0,0.07)", border: "1px solid rgba(240,165,0,0.2)", borderRadius: 8, padding: "10px 12px" }}>
            <AlertTriangle size={14} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: "var(--sub)", lineHeight: 1.5 }}>
              {form.symbol} est une paire croisée sans $ en base ni en cotation (ou un instrument non-Forex) —
              aucune donnée ici ne permet de déduire le taux. Renseigne la valeur du pip manuellement
              depuis ta plateforme (MT4/MT5/cTrader l'affichent pour le symbole et la taille de lot choisis).
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
          Calcul automatique fiable pour les paires cotées en $ (EUR/USD, GBP/USD, AUD/USD, NZD/USD) et pour les
          paires en $ de base (USD/JPY, USD/CAD, USD/CHF — via le prix actuel). Pour les paires croisées sans $
          du tout, les indices, l'or ou les matières premières, renseigne toujours la valeur du pip manuellement.
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
