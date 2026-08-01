// lib/cot-classification.js
// Applique les règles de classification du prompt COT TFF (100% déterministe, aucun LLM impliqué)
// Prend en entrée la sortie de analyserDevise() (lib/cot-analytics.js)
//
// HYPOTHÈSES EXPLICITES (seuils non chiffrés dans le prompt d'origine, à valider) :
//   - "Dealer très short/long" = |Z-Score Dealer| >= 2.0 (seuil "Très Fort" du prompt)
//   - "Dealer neutre" = |Z-Score Dealer| < 1.5
//   - Le "Z" de la table Phase Marché = Z-Score Total (AM+LF), pas Z-Score isolé d'une catégorie

function classifierZScore(z) {
  if (z === null) return { label: "Non calculable", poids: null };
  const absZ = Math.abs(z);
  if (absZ < 1.5) return { label: "Normal", poids: "100%" };
  if (absZ < 2.0) return { label: "Fort", poids: "60%" };
  if (absZ < 2.5) return { label: "Très Fort", poids: "30%" };
  return { label: "Extrême", poids: "0-50%" };
}

function classifierSignalDealer(zD, netD, netAM) {
  if (zD === null) return { lecture: "Non calculable", confirmation: "Indéterminé" };

  const dealerTresShort = zD <= -2.0; // Dealer très short = clients très longs = marché suracheté
  const dealerTresLong = zD >= 2.0;   // Dealer très long = clients très short = marché survendu
  const dealerNeutre = Math.abs(zD) < 1.5;

  const amLong = netAM > 0;
  const amShort = netAM < 0;

  let lecture, confirmation;

  if (dealerNeutre) {
    lecture = `Dealer neutre (Z=${zD})`;
    confirmation = "Signal non exploitable";
  } else if (dealerTresShort) {
    lecture = `Dealer très short (Z=${zD}) → clients positionnés long, marché suracheté`;
    confirmation = amLong ? "BULLE CONFIRMÉE" : "Dealer extrême seul, AM ne confirme pas";
  } else if (dealerTresLong) {
    lecture = `Dealer très long (Z=${zD}) → clients positionnés short, marché survendu`;
    confirmation = amShort ? "SQUEEZE CONFIRMÉ" : "Dealer extrême seul, AM ne confirme pas";
  } else {
    lecture = `Dealer modérément positionné (Z=${zD})`;
    confirmation = "Signal partiel, sous le seuil de confirmation";
  }

  return { lecture, confirmation };
}

function classifierDivergenceAmLf(netAM, netLF, zTotal) {
  const seuil = 30000; // seuil fixe du prompt : ±30k contrats

  if (netAM > seuil && netLF < -seuil) {
    return { type: "Divergence HAUSSIÈRE", recommandation: `Suivre AM (+${netAM})` };
  }
  if (netAM < -seuil && netLF > seuil) {
    return { type: "Divergence BAISSIÈRE", recommandation: `Suivre AM (${netAM})` };
  }

  const memeSigne = (netAM >= 0 && netLF >= 0) || (netAM < 0 && netLF < 0);
  if (memeSigne) {
    const risqueCrowding = zTotal !== null && Math.abs(zTotal) > 2.0;
    return {
      type: "CONSENSUS",
      recommandation: risqueCrowding
        ? "Risque de crowding élevé (Z>2.0) — vigilance"
        : "Consensus sans risque de crowding immédiat"
    };
  }

  return { type: "Situation mixte", recommandation: "Pas de règle stricte applicable, analyse manuelle requise" };
}

function classifierPhaseMarche(zTotal, delta4STotal) {
  if (zTotal === null) {
    return { phase: "Non calculable", strategie: "N/A", sizing: "N/A" };
  }

  const absZ = Math.abs(zTotal);

  // Ordre de vérification : du plus extrême (Bulle/Squeeze) au plus normal (Build-up)
  if (absZ >= 2.5 && delta4STotal !== null && delta4STotal > 30) {
    return { phase: "BULLE", strategie: "EXIT, préparer position contrarienne", sizing: "0%, préparation contrarien" };
  }
  if (absZ >= 2.5 && delta4STotal !== null && delta4STotal < -20) {
    return { phase: "SQUEEZE", strategie: "CONTRARIEN", sizing: "50%" };
  }
  if (absZ >= 2.5) {
    return { phase: "EXTRÊME (sans confirmation Δ4S)", strategie: "VIGILANCE ÉLEVÉE", sizing: "0-50%" };
  }
  if (absZ >= 2.0) {
    return { phase: "SATURATION", strategie: "VIGILANCE", sizing: "30%" };
  }
  if (absZ >= 1.5) {
    return { phase: "CONVICTION", strategie: "MAINTENIR", sizing: "60%" };
  }
  if (delta4STotal !== null && delta4STotal > 20) {
    return { phase: "BUILD-UP", strategie: "SUIVRE", sizing: "100%" };
  }
  return { phase: "NORMAL (pas de build-up marqué)", strategie: "SUIVRE avec prudence", sizing: "60-100%" };
}

function classifierCOT(analyse) {
  if (!analyse) return null;

  const { devise, reportDate, positionnement, zScore, percentile, court_terme } = analyse;
  const { netD, netAM, netLF, netTotal } = positionnement;

  const classifD = classifierZScore(zScore.D);
  const classifAM = classifierZScore(zScore.AM);
  const classifLF = classifierZScore(zScore.LF);
  const classifTotal = classifierZScore(zScore.total);

  const signalDealer = classifierSignalDealer(zScore.D, netD, netAM);
  const divergence = classifierDivergenceAmLf(netAM, netLF, zScore.total);

  const delta4S = court_terme.delta4S_total ?? null;
  const delta13S = court_terme.delta13S_total ?? null;
  const phase = classifierPhaseMarche(zScore.total, delta4S);

  return {
    devise,
    reportDate,

    positionnement: { netD, netAM, netLF, netTotal },

    signalDealer,

    longTerme: {
      zScoreD: zScore.D, classifD: classifD.label,
      zScoreAM: zScore.AM, classifAM: classifAM.label,
      zScoreLF: zScore.LF, classifLF: classifLF.label,
      zScoreTotal: zScore.total, classifTotal: classifTotal.label,
      percentileTotal: percentile.total
    },

    courtTerme: court_terme.note
      ? { note: court_terme.note }
      : { delta4S, delta13S },

    divergenceAmLf: divergence,

    decision: {
      phase: phase.phase,
      strategie: phase.strategie,
      sizing: phase.sizing,
      biais: netTotal > 0 ? "Haussier (foule long)" : netTotal < 0 ? "Baissier (foule short)" : "Neutre",
      invalidation: zScore.total !== null
        ? `Z-Score Total repasse sous ${(Math.abs(zScore.total) - 0.5).toFixed(1)} ou inversion momentum 3 semaines`
        : "Non calculable"
    }
  };
}

module.exports = { classifierCOT, classifierZScore, classifierPhaseMarche };

// Test isolé : "node lib/cot-classification.js"
if (require.main === module) {
  require("dotenv").config({ path: ".env.local" });
  const { fetchHistoriqueCOT } = require("./cot-historique-r2");
  const { analyserDevise } = require("./cot-analytics");

  fetchHistoriqueCOT("2024-06-01")
    .then(parDevise => {
      const analyseEUR = analyserDevise(parDevise.EUR);
      analyseEUR.devise = "EUR";
      const classification = classifierCOT(analyseEUR);
      console.log(JSON.stringify(classification, null, 2));
    })
    .catch(err => console.error("Erreur:", err.message));
}
