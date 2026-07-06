/**
 * Calcul de la taille de position (lots) à partir du risque accepté.
 *
 * Précision : le calcul automatique n'est mathématiquement garanti que pour
 * les paires où le $ est la devise de COTATION (2e partie du symbole) —
 * EUR/USD, GBP/USD, AUD/USD, NZD/USD. Pour toute autre paire (USD en devise
 * de base comme USD/JPY ou USD/CAD ; paire croisée sans USD comme EUR/GBP ;
 * indices/matières premières/obligations), la valeur du pip dépend d'un taux
 * de change ou des spécifications du contrat chez ton broker — dans ces cas,
 * le champ "Valeur du pip" doit être rempli avec la valeur affichée
 * directement sur ta plateforme (MT4/MT5/cTrader affichent cette valeur pour
 * le symbole et la taille de lot choisis), sans quoi le calcul ne peut pas
 * être garanti précis.
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
 * Vrai uniquement si le dollar est la devise de COTATION (2e partie du symbole) —
 * seul cas où "taille du pip × taille du lot" donne directement une valeur en $
 * sans aucune conversion de change. Toute autre paire (USD en devise de base,
 * comme USD/JPY, USD/CAD ; ou paire croisée sans USD du tout, comme EUR/GBP)
 * a besoin de la vraie valeur du pip, lue directement sur la plateforme.
 */
export function isUsdQuoted(symbol) {
  return isForexPair(symbol) && symbol.endsWith("/USD");
}

/**
 * Vrai si le dollar est la devise de BASE (1ère partie du symbole) —
 * USD/JPY, USD/CAD, USD/CHF. Dans ce cas précis, le prix d'ENTRÉE déjà tapé
 * dans le formulaire EST directement le taux de change nécessaire (ex: entrée
 * USD/CAD à 1.3600 = 1 USD vaut 1.3600 CAD) — donc le calcul peut rester
 * automatique sans champ supplémentaire, contrairement aux paires croisées
 * sans USD du tout (EUR/GBP, GBP/AUD...) qui, elles, exigent une vraie
 * donnée externe.
 */
export function isUsdBase(symbol) {
  return isForexPair(symbol) && symbol.startsWith("USD/");
}

/**
 * Convertit une distance entre deux niveaux de prix (entrée et SL/TP) en
 * nombre de pips, pour une paire Forex standard reconnue. Retourne null si
 * le symbole n'est pas une paire Forex standard ou si les prix sont invalides.
 */
export function pipsFromPrices(entry, target, symbol) {
  const pipSize = standardPipSize(symbol);
  const e = parseFloat(entry);
  const t = parseFloat(target);
  if (pipSize == null || Number.isNaN(e) || Number.isNaN(t)) return null;
  return Math.abs(e - t) / pipSize;
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
 * @param {number} params.entryPrice - prix d'entrée du trade, utilisé comme taux de
 *   change pour les paires USD-en-base (USD/JPY, USD/CAD, USD/CHF)
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
  entryPrice,
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

  const usdQuote = isUsdQuoted(symbol);
  const usdBase = isUsdBase(symbol);
  const prixEntree = parseFloat(entryPrice);
  let pipValue = null;
  let pipValueSource = null;

  if (pipValueOverride) {
    pipValue = parseFloat(pipValueOverride);
    pipValueSource = "manuelle";
  } else if (usdQuote) {
    // Le $ est déjà la devise de cotation — aucune conversion nécessaire.
    const pipSizeStandard = standardPipSize(symbol);
    pipValue = pipSizeStandard * lot;
    pipValueSource = "standard";
  } else if (usdBase && prixEntree > 0) {
    // Le $ est la devise de base — le prix d'entrée EST le taux de change.
    const pipSizeStandard = standardPipSize(symbol);
    pipValue = (pipSizeStandard * lot) / prixEntree;
    pipValueSource = "dérivée du prix d'entrée";
  } else if (usdBase && !(prixEntree > 0)) {
    errors.push(
      "Cette paire (USD en devise de base) peut être calculée automatiquement, mais il manque le prix d'entrée pour servir de taux de change."
    );
  } else {
    errors.push(
      "Cette paire croisée n'a le $ ni en cotation ni en base — aucune donnée du formulaire ne permet de déduire le taux. " +
      "Renseigne la valeur du pip manuellement (visible dans ta plateforme, pour la taille de lot choisie)."
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
