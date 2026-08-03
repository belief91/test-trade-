/**
 * bond-yield-curve-analysis.js
 * ------------------------------------------------------------------
 * A placer dans E:\trading-journal\lib\
 *
 * Pré-calcule TOUT ce qui est déterministe (spreads, forme de courbe,
 * direction de flux, cohérence 2Y/10Y) à partir des données déjà
 * scrapées par bond-yield-maturities-service.js (/api/bond-yields).
 *
 * Objectif : l'IA ne reçoit plus de rendements bruts à additionner/
 * soustraire elle-même — elle reçoit des résultats déjà calculés et
 * écrit uniquement le narratif + les jugements qualitatifs (BIAIS,
 * VALIDATION), conformément à la règle "Zéro invention de rendements
 * ou spreads" du prompt.
 *
 * Seuil PLATE : -0.10 à +0.10 (en points de %), tel que défini dans
 * le prompt fourni.
 */

const SEUIL_PLATE = 0.10;

/**
 * Transforme le tableau plat [{currency, maturity, yield, ...}, ...]
 * (sortie de scraperMaturitesG10) en map { USD: { "2Y": 4.22, "10Y": 4.60 }, ... }
 */
function indexerParDevise(yields) {
  const parDevise = {};
  for (const item of yields) {
    if (!parDevise[item.currency]) {
      parDevise[item.currency] = { country: item.country };
    }
    parDevise[item.currency][item.maturity] = item.yield;
  }
  return parDevise;
}

function classifierCourbe(spread) {
  if (spread > SEUIL_PLATE) return "PENTIFIÉE";
  if (spread < -SEUIL_PLATE) return "INVERSÉE";
  return "PLATE";
}

function directionFlux(spread, devise) {
  if (spread === null) return null;
  if (spread > 0) return "USD";
  if (spread < 0) return devise;
  return "NEUTRE";
}

/**
 * Point d'entrée. Prend le tableau brut de /api/bond-yields et
 * retourne, pour chaque devise avec 2Y ET 10Y disponibles, tous les
 * résultats calculés — prêts à être injectés dans le prompt IA.
 *
 * Les devises sans 2Y ou 10Y complet sont automatiquement exclues
 * (ex: si jamais CHF ou NZD perdaient leur 2Y ou 10Y un jour) —
 * conforme à la règle "Si rendement manquant → IGNORER la paire".
 */
function analyserCourbesDeTaux(yields) {
  const parDevise = indexerParDevise(yields);

  const usd2Y = parDevise.USD?.["2Y"] ?? null;
  const usd10Y = parDevise.USD?.["10Y"] ?? null;
  const usdComplet = usd2Y !== null && usd10Y !== null;

  const resultats = [];
  const devisesIgnorees = [];

  for (const [devise, valeurs] of Object.entries(parDevise)) {
    const y2 = valeurs["2Y"] ?? null;
    const y10 = valeurs["10Y"] ?? null;

    if (y2 === null || y10 === null) {
      devisesIgnorees.push({ devise, raison: "2Y ou 10Y manquant" });
      continue;
    }

    const spreadCourbe = Math.round((y10 - y2) * 1000) / 1000;
    const formeCourbe = classifierCourbe(spreadCourbe);

    let spreadFX10Y = null;
    let spreadFX2Y = null;
    let directionFX10Y = null;
    let directionFX2Y = null;
    let coherence = null;

    if (devise !== "USD" && usdComplet) {
      spreadFX10Y = Math.round((usd10Y - y10) * 1000) / 1000;
      spreadFX2Y = Math.round((usd2Y - y2) * 1000) / 1000;
      directionFX10Y = directionFlux(spreadFX10Y, devise);
      directionFX2Y = directionFlux(spreadFX2Y, devise);
      coherence = directionFX10Y === directionFX2Y ? "OUI" : "NON";
    }

    resultats.push({
      devise,
      pays: valeurs.country,
      yield2Y: y2,
      yield10Y: y10,
      spreadCourbe,
      formeCourbe,
      spreadFX10Y,
      spreadFX2Y,
      directionFX10Y,
      directionFX2Y,
      coherenceFX: coherence,
    });
  }

  return {
    resultats,
    devisesIgnorees,
    usdDisponible: usdComplet,
    dateCalcul: new Date().toISOString(),
  };
}

export { analyserCourbesDeTaux, indexerParDevise };
