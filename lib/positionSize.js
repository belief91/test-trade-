/**
 * Calcul de la taille de position (lots) à partir du risque accepté.
 *
 * Précision : ce calcul est mathématiquement exact pour les paires Forex
 * standards quand la devise de cotation (la 2e devise du symbole) correspond
 * à la devise du compte — cas le plus courant (compte en USD, paire XXX/USD).
 *
 * Pour les paires croisées (ex: EUR/GBP avec un compte en USD), ou pour les
 * indices/matières premières/obligations, la valeur exacte du pip dépend des
 * spécifications du contrat chez TON broker (taille de lot, devise de profit,
 * marge). Dans ces cas, le champ "Valeur du pip (override)" doit être rempli
 * manuellement avec la valeur exacte affichée dans la plateforme du broker —
 * sans cette info, le calcul ne peut pas être garanti précis à 100%.
 */

const JPY_PAIRS = ["USD/JPY", "EUR/JPY", "GBP/JPY", "AUD/JPY", "NZD/JPY", "CAD/JPY", "CHF/JPY"];

/**
 * Détermine la taille du pip standard pour une paire Forex donnée.
 * Retourne null si le symbole n'est pas une paire Forex standard reconnue
 * (indices, matières premières, obligations) — dans ce cas, une valeur de
 * pip manuelle est requise pour un calcul fiable.
 */
export function standardPipSize(symbol) {
  if (!symbol || !symbol.includes("/")) return null; // pas une paire Forex (ex: "XAUUSD (Or)")
  return JPY_PAIRS.includes(symbol) ? 0.01 : 0.0001;
}

export function isForexPair(symbol) {
  return !!symbol && symbol.includes("/") && !symbol.includes("(");
}

/**
 * Calcule la taille de position en lots standards (1 lot = 100 000 unités).
 *
 * @param {Object} params
 * @param {number} params.soldeCompte - solde du compte
 * @param {number} params.risquePourcentage - % du solde à risquer (utilisé si risqueMontant absent)
 * @param {number} params.risqueMontant - montant fixe à risquer (prioritaire sur le %)
 * @param {number} params.slPips - distance du stop loss, en pips
 * @param {number} params.tpPips - distance du take profit, en pips (optionnel, pour le R:R)
 * @param {number} params.tailleLot - taille du lot standard (défaut 100000)
 * @param {number} params.pipValueOverride - valeur du pip fournie manuellement (prioritaire)
 * @param {string} params.symbol - symbole tradé, pour déterminer le pip standard si possible
 */
export function calculatePositionSize({
  soldeCompte,
  risquePourcentage,
  risqueMontant,
  slPips,
  tpPips,
  tailleLot = 100000,
  pipValueOverride,
  symbol,
}) {
  const errors = [];

  const solde = parseFloat(soldeCompte);
  const sl = parseFloat(slPips);
  const lot = parseFloat(tailleLot) || 100000;

  if (!solde || solde <= 0) errors.push("Le solde du compte doit être positif.");
  if (!sl || sl <= 0) errors.push("Le stop loss (en pips) doit être positif.");

  let montantRisque;
  if (risqueMontant) {
    montantRisque = parseFloat(risqueMontant);
  } else if (risquePourcentage) {
    montantRisque = (solde * parseFloat(risquePourcentage)) / 100;
  } else {
    errors.push("Indique un risque, en % du solde ou en montant fixe.");
  }

  const pipSizeStandard = standardPipSize(symbol);
  let pipValue = null;
  let pipValueSource = null;

  if (pipValueOverride) {
    pipValue = parseFloat(pipValueOverride);
    pipValueSource = "manuelle";
  } else if (pipSizeStandard != null) {
    // Pip value par lot standard, en supposant devise de cotation = devise du compte
    pipValue = pipSizeStandard * lot;
    pipValueSource = "standard";
  } else {
    errors.push(
      "Ce symbole n'est pas une paire Forex standard — renseigne la valeur du pip manuellement (visible dans ta plateforme broker) pour un calcul fiable."
    );
  }

  if (errors.length > 0) {
    return { errors, result: null };
  }

  const tailleLots = montantRisque / (sl * pipValue);
  const tailleUnites = tailleLots * lot;
  const ratioRR = tpPips ? parseFloat(tpPips) / sl : null;

  return {
    errors: [],
    result: {
      montantRisque: Math.round(montantRisque * 100) / 100,
      tailleLots: Math.round(tailleLots * 100) / 100,
      tailleUnites: Math.round(tailleUnites),
      pipValue: Math.round(pipValue * 1000) / 1000,
      pipValueSource,
      ratioRR: ratioRR ? Math.round(ratioRR * 100) / 100 : null,
    },
  };
}
