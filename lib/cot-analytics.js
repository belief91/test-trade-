// lib/cot-analytics.js
// Calcule Z-Score (52S), Percentile (104S), Δ4S, Δ13S pour Dealer/AssetMgr/LevMoney/NetTotal
// Prend en entrée le résultat de fetchHistoriqueCOT() (lib/cot-historique-r2.js)
// Sortie : un objet condensé par devise, prêt à être envoyé au prompt/API Anthropic
// (le calcul numérique se fait ICI, pas dans le LLM, pour éviter toute hallucination arithmétique)

function moyenne(valeurs) {
  return valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
}

function ecartTypeEchantillon(valeurs) {
  if (valeurs.length < 2) return null; // écart-type non défini avec moins de 2 points
  const m = moyenne(valeurs);
  const sommeCarres = valeurs.reduce((acc, v) => acc + Math.pow(v - m, 2), 0);
  return Math.sqrt(sommeCarres / (valeurs.length - 1)); // formule échantillon (n-1)
}

function calculerZScore(valeurActuelle, fenetre52S) {
  if (fenetre52S.length < 10) return null; // pas assez de données pour un Z-Score fiable
  const m = moyenne(fenetre52S);
  const ecartType = ecartTypeEchantillon(fenetre52S);
  if (!ecartType || ecartType === 0) return null;
  return +((valeurActuelle - m) / ecartType).toFixed(2);
}

function calculerPercentile(valeurActuelle, fenetre104S) {
  if (fenetre104S.length === 0) return null;
  const nbInferieurOuEgal = fenetre104S.filter(v => v <= valeurActuelle).length;
  return Math.round((nbInferieurOuEgal / fenetre104S.length) * 100);
}

function calculerDelta(actuel, ancien) {
  if (ancien === null || ancien === undefined || ancien === 0) return null; // évite division par zéro
  return +(((actuel - ancien) / Math.abs(ancien)) * 100).toFixed(2);
}

// Extrait la série "net" d'une catégorie (dealer/assetMgr/levMoney) sur tout l'historique d'une devise
function extraireSerie(historiqueDevise, categorie) {
  return historiqueDevise.map(ligne => ligne[categorie].net);
}

function analyserDevise(historiqueDevise) {
  if (!historiqueDevise || historiqueDevise.length === 0) return null;

  const derniereLigne = historiqueDevise[historiqueDevise.length - 1];
  const netD = derniereLigne.dealer.net;
  const netAM = derniereLigne.assetMgr.net;
  const netLF = derniereLigne.levMoney.net;
  const netTotal = netAM + netLF; // AM + LF, selon la définition du prompt

  // Série "Net Total" complète (nécessaire pour Z-Score/percentile du total)
  const serieNetTotal = historiqueDevise.map(l => l.assetMgr.net + l.levMoney.net);
  const serieD = extraireSerie(historiqueDevise, "dealer");
  const serieAM = extraireSerie(historiqueDevise, "assetMgr");
  const serieLF = extraireSerie(historiqueDevise, "levMoney");

  // Fenêtres glissantes : 52 dernières semaines pour Z-Score, 104 pour percentile
  const derniere52 = (serie) => serie.slice(-52);
  const derniere104 = (serie) => serie.slice(-104);

  // Δ4S et Δ13S : valeur il y a 4 et 13 semaines (index depuis la fin)
  const valeurIlYA = (serie, nbSemaines) => {
    const idx = serie.length - 1 - nbSemaines;
    return idx >= 0 ? serie[idx] : null;
  };

  const ctDisponible = historiqueDevise.length >= 14; // besoin d'au moins 13S + 1 pour Δ13S

  return {
    devise: null, // rempli par l'appelant
    reportDate: derniereLigne.reportDate,
    nbSemainesDisponibles: historiqueDevise.length,

    positionnement: {
      netD, netAM, netLF, netTotal
    },

    zScore: {
      D: calculerZScore(netD, derniere52(serieD)),
      AM: calculerZScore(netAM, derniere52(serieAM)),
      LF: calculerZScore(netLF, derniere52(serieLF)),
      total: calculerZScore(netTotal, derniere52(serieNetTotal))
    },

    percentile: {
      D: calculerPercentile(netD, derniere104(serieD)),
      AM: calculerPercentile(netAM, derniere104(serieAM)),
      LF: calculerPercentile(netLF, derniere104(serieLF)),
      total: calculerPercentile(netTotal, derniere104(serieNetTotal))
    },

    court_terme: ctDisponible ? {
      delta4S_total: calculerDelta(netTotal, valeurIlYA(serieNetTotal, 4)),
      delta13S_total: calculerDelta(netTotal, valeurIlYA(serieNetTotal, 13))
    } : { note: "CT non calculable, historique insuffisant (moins de 14 semaines)" }
  };
}

function calculerAnalyticsToutesDevises(parDevise) {
  const resultat = {};
  for (const [devise, historique] of Object.entries(parDevise)) {
    const analyse = analyserDevise(historique);
    if (analyse) {
      analyse.devise = devise;
      resultat[devise] = analyse;
    }
  }
  return resultat;
}

module.exports = { calculerAnalyticsToutesDevises, analyserDevise };

// Test isolé : "node lib/cot-analytics.js"
if (require.main === module) {
  require("dotenv").config({ path: ".env.local" });
  const { fetchHistoriqueCOT } = require("./cot-historique-r2");

  fetchHistoriqueCOT("2024-06-01")
    .then(parDevise => {
      const analytics = calculerAnalyticsToutesDevises(parDevise);
      console.log(JSON.stringify(analytics.EUR, null, 2));
    })
    .catch(err => console.error("Erreur:", err.message));
}
