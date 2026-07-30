// lib/central-bank-keywords.js
// Source : BELIEFX_referentiel_categorise.pdf
// Référentiel dédupliqué — événements bancaires + mots-clés monétaires G10

// ─────────────────────────────────────────────────────────────
// A.8 — Déclencheurs génériques (script de reconnaissance matin)
// Recoupe les catégories A.1 à A.5 du référentiel
// ─────────────────────────────────────────────────────────────
export const EVENT_TRIGGERS = [
  "fomc",
  "rate statement",
  "rate decision",
  "policy statement",
  "monetary policy statement",
  "monetary policy assessment",
  "minutes",
  "press conference",
  "governor speech",
];

// ─────────────────────────────────────────────────────────────
// Mapping devise → banque centrale (10 institutions G10)
// ─────────────────────────────────────────────────────────────
export const DEVISE_TO_BANQUE = {
  USD: "Fed",
  EUR: "ECB",
  GBP: "BoE",
  JPY: "BoJ",
  CHF: "SNB",
  CAD: "BoC",
  AUD: "RBA",
  NZD: "RBNZ",
  NOK: "Norges Bank",
  SEK: "Riksbank",
};

// ─────────────────────────────────────────────────────────────
// B — Mots-clés monétaires, par catégorie fonctionnelle
// Utilisés par le script de filtrage de paragraphes (post-scraping)
// ─────────────────────────────────────────────────────────────
export const MONETARY_KEYWORDS = {
  politiqueMonetaire: [
    "monetary policy", "policy stance", "policy rate", "bank rate",
    "interest rate", "restrictive", "accommodative", "easing", "tightening",
    "hike", "cut", "hold", "pause", "pivot", "forward guidance", "rate path",
    "terminal rate", "gradual adjustment", "policy normalization",
    "less restrictive", "sufficiently restrictive", "recalibrating", "dial back",
  ],
  inflation: [
    "inflation", "core inflation", "underlying inflation", "services inflation",
    "disinflation", "price stability", "inflation expectations",
    "inflationary pressures", "cpi", "core cpi", "pce", "core pce",
    "above target", "below target", "transitory", "persistent", "deflation",
    "price pressure", "2% target", "sticky inflation", "second-round effects",
    "broad-based inflation", "wage-price spiral", "shelter inflation",
    "goods deflation", "last mile",
  ],
  croissanceActivite: [
    "growth", "economic activity", "domestic demand", "slowdown", "recovery",
    "recession", "soft landing", "hard landing", "gdp", "expansion",
    "contraction", "stagflation", "resilient", "robust growth",
    "economic outlook", "downside risk", "upside risk", "output gap",
    "demand weakening", "leading indicators", "pmi", "yield curve inverted",
    "consumer spending", "business investment", "credit growth",
  ],
  marcheTravail: [
    "labor market", "labour market", "employment", "unemployment", "wages",
    "wage growth", "earnings", "slack", "nfp", "full employment",
    "job creation", "jobless claims", "labor market tight", "labor market cooling",
    "participation rate", "job openings", "quits rate", "hiring", "layoffs",
    "labor market rebalancing", "real wages", "nominal wages",
  ],
  guidanceOrientation: [
    "outlook", "uncertainty", "balanced risks", "data dependent",
    "higher for longer", "premature cut", "meeting by meeting", "dot plot",
    "sep", "patient", "watchful", "optionality", "not on a preset course",
    "gaining confidence", "further progress", "sufficient progress",
    "the time has come", "we cannot declare victory", "premature easing",
    "inflation not yet defeated", "cannot declare victory", "strong vigilance",
  ],
  liquiditeBilan: [
    "balance sheet", "qe", "qt", "asset purchases", "reinvestment", "reserves",
    "tapering", "pepp", "app", "yield curve control", "ycc",
    "balance sheet runoff",
  ],
  conditionsFinancieres: [
    "exchange rate", "currency", "financial conditions", "credit conditions",
    "yield curve", "financial stability", "systemic risk", "banking stress",
    "market volatility", "financial conditions eased", "financial conditions tightened",
  ],
};

// ─────────────────────────────────────────────────────────────
// B.8 — Mots-clés spécifiques par banque (non transférables)
// ─────────────────────────────────────────────────────────────
export const BANK_SPECIFIC_KEYWORDS = {
  Fed: ["fed funds rate", "fomc", "dot plot", "beige book", "median dot"],
  ECB: ["deposit facility rate", "app", "pepp", "tpi", "main refinancing rate"],
  BoJ: ["ycc", "negative interest rate", "exit from nirp", "nimble operations"],
  BoE: ["mpc", "mpc vote", "gilt purchases", "voted to hike", "voted to cut", "voted unanimously"],
  SNB: ["sight deposits", "chf too strong", "fx intervention"],
  BoC: ["overnight rate", "canadian cpi"],
  RBA: ["cash rate", "board judged"],
  // RBNZ, Norges Bank, Riksbank : pas de mots-clés spécifiques listés dans le référentiel
  RBNZ: [],
  "Norges Bank": [],
  Riksbank: [],
};

// ─────────────────────────────────────────────────────────────
// B.9 — Mots pièges : poids nul si isolés.
// RÈGLE : un mot piège ne compte JAMAIS comme déclencheur à lui seul.
// Un paragraphe n'est retenu QUE s'il contient au moins un mot-clé
// des catégories 1-8 (MONETARY_KEYWORDS ou BANK_SPECIFIC_KEYWORDS).
// Si un mot piège est présent SANS mot de catégorie 1-8 dans le même
// paragraphe → paragraphe ignoré, même si le mot piège apparaît.
// ─────────────────────────────────────────────────────────────
export const TRAP_WORDS = [
  "inflation",
  "growth",
  "appropriate",
  "risks",
  "gradual",
  "normalization",
  "conditions",
  "data",
  "uncertainty",
  "flexibility", // BoJ/YCC — retiré comme signal fiable (démenti Ueda, juillet 2023)
];// À AJOUTER dans lib/central-bank-keywords.js (ne remplace pas le fichier,
// s'ajoute aux exports existants : EVENT_TRIGGERS, DEVISE_TO_BANQUE, etc.)

// ─────────────────────────────────────────────────────────────
// Correspondance texte du calendrier → catégorie précise à scraper.
// Remplace l'usage de EVENT_TRIGGERS pour la reconnaissance : au lieu
// de juste détecter "il y a un event bancaire", on détermine QUELLE
// catégorie exacte scraper (une seule, jamais les 7).
// ─────────────────────────────────────────────────────────────
export const EVENT_TO_CATEGORY = [
  {
    motsCles: ["rate decision", "rate statement", "interest rate decision", "monetary policy assessment", "policy statement"],
    categorie: "statement",
  },
  { motsCles: ["minutes"], categorie: "minutes" },
  { motsCles: ["press conference"], categorie: "presseConference" },
  { motsCles: ["governor speech", "speech"], categorie: "discours" },
  { motsCles: ["monetary policy report", "monetary policy statement", "statement on monetary policy", "outlook for economic activity"], categorie: "monetaryPolicyReport" },
  { motsCles: ["beige book", "business outlook survey", "summary of opinions"], categorie: "beigeBook" },
];

/**
 * Trouve la catégorie correspondant au texte d'un événement du calendrier.
 * Retourne null si aucune catégorie ne matche (→ SKIP, rien à scraper).
 */
export function trouverCategoriePourEvenement(nomEvenement) {
  if (!nomEvenement) return null;
  const texte = nomEvenement.toLowerCase();
  const match = EVENT_TO_CATEGORY.find((entry) =>
    entry.motsCles.some((mot) => texte.includes(mot))
  );
  return match ? match.categorie : null;
}

