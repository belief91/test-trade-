// lib/paragraph-filter-service.js
// Filtre le texte scrapé PHRASE PAR PHRASE (pas paragraphe entier), pour
// éviter de garder des blocs de plusieurs centaines de mots à cause d'un
// seul mot-clé trouvé au milieu (cause du problème des ~420 paragraphes
// géants observé avec les transcripts de conférence de presse).
// Règle des mots pièges INCHANGÉE : ignorés si absents des catégories 1-8.

import { MONETARY_KEYWORDS, BANK_SPECIFIC_KEYWORDS } from "./central-bank-keywords";

function construireMotsCleSignal(banqueCentrale) {
  const motsCategories1a7 = Object.values(MONETARY_KEYWORDS).flat();
  const motsSpecifiquesBanque = BANK_SPECIFIC_KEYWORDS[banqueCentrale] || [];
  return [...motsCategories1a7, ...motsSpecifiquesBanque];
}

/**
 * Découpe le texte en phrases. Gère les abréviations courantes (ex: "U.S.",
 * "Mr.", "vs.") de façon simple pour limiter les faux découpages — pas
 * parfait, mais suffisant pour ce cas d'usage (le pire cas est une phrase
 * coupée un peu tôt, pas une perte d'information).
 */
function decouperEnPhrases(texteBrut) {
  const texteNettoye = texteBrut.replace(/\s+/g, " ").trim();

  // Découpe sur '.', '!', '?' suivis d'un espace + majuscule, ou fin de texte.
  const phrases = texteNettoye.match(/[^.!?]+[.!?]+(\s+|$)/g) || [texteNettoye];

  return phrases.map((p) => p.trim()).filter((p) => p.length > 0);
}

function contientMotCleSignal(phrase, motsCleSignal) {
  const texte = phrase.toLowerCase();
  return motsCleSignal.some((mot) => texte.includes(mot));
}

/**
 * Fonction principale — appelée après le scraping.
 * @param {string} texteScrape - texte brut récupéré depuis la page/PDF de la BC
 * @param {string} banqueCentrale - ex: "Fed", "ECB" (mots-clés spécifiques)
 * @returns {string[]} - liste des PHRASES retenues (contiennent au moins
 *   1 mot de catégorie 1-8, mots pièges seuls exclus)
 */
export function filtrerParagraphes(texteScrape, banqueCentrale) {
  const motsCleSignal = construireMotsCleSignal(banqueCentrale);
  const phrases = decouperEnPhrases(texteScrape);

  const phrasesRetenues = phrases.filter((p) => contientMotCleSignal(p, motsCleSignal));

  return phrasesRetenues;
}
