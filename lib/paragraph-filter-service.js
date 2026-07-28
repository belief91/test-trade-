// lib/paragraph-filter-service.js
// Filtre les paragraphes d'un texte scrapé selon les mots-clés monétaires (catégories 1-8).
// Règle stricte : un mot piège (TRAP_WORDS) ne compte JAMAIS seul comme déclencheur.
// Un paragraphe n'est retenu que s'il contient au moins un mot des catégories 1-8.

import {
  MONETARY_KEYWORDS,
  BANK_SPECIFIC_KEYWORDS,
  TRAP_WORDS,
} from "./central-bank-keywords";

// Rassemble tous les mots-clés "de signal réel" (catégories 1-8) en une seule liste plate
function construireMotsCleSignal(banqueCentrale) {
  const motsCategories1a7 = Object.values(MONETARY_KEYWORDS).flat();
  const motsSpecifiquesBanque = BANK_SPECIFIC_KEYWORDS[banqueCentrale] || [];
  return [...motsCategories1a7, ...motsSpecifiquesBanque];
}

// Découpe le texte scrapé en paragraphes (double saut de ligne ou balises <p>)
function decouperEnParagraphes(texteBrut) {
  return texteBrut
    .split(/\n\s*\n|<\/p>/i)
    .map((p) => p.replace(/<[^>]+>/g, "").trim())
    .filter((p) => p.length > 0);
}

function contientMotCleSignal(paragraphe, motsCleSignal) {
  const texte = paragraphe.toLowerCase();
  return motsCleSignal.some((mot) => texte.includes(mot));
}

/**
 * Fonction principale — appelée après le scraping.
 * @param {string} texteScrape - texte brut récupéré depuis la page de la BC
 * @param {string} banqueCentrale - ex: "Fed", "ECB" (pour inclure les mots-clés spécifiques)
 * @returns {string[]} - liste des paragraphes retenus (contiennent au moins 1 mot de catégorie 1-8)
 */
export function filtrerParagraphes(texteScrape, banqueCentrale) {
  const motsCleSignal = construireMotsCleSignal(banqueCentrale);
  const paragraphes = decouperEnParagraphes(texteScrape);

  const paragraphesRetenus = paragraphes.filter((p) =>
    contientMotCleSignal(p, motsCleSignal)
  );

  // Note : TRAP_WORDS n'est jamais utilisé ici comme critère d'inclusion.
  // Un paragraphe contenant uniquement "inflation" (sans mot de catégorie 1-8)
  // ne passe pas le filtre ci-dessus, donc il est automatiquement exclu.
  // TRAP_WORDS est importé pour référence/documentation mais volontairement
  // absent de la logique de sélection — voir commentaire dans central-bank-keywords.js

  return paragraphesRetenus;
}
