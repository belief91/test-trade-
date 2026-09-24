// lib/paragraph-filter-service.js
// Filtre le texte scrapé PHRASE PAR PHRASE (pas paragraphe entier).
//
// FIX (test Fed, 20/09) : la règle B.9 des mots pièges était documentée
// mais jamais branchée — TRAP_WORDS n'était ni importé ni utilisé.
// Confirmé en conditions réelles : "hike" (classé mot fort à tort)
// faisait passer 3 phrases hors-sujet dans un discours Fed ("hikes on
// the trails around Jackson Hole"). Désormais : TRAP_WORDS est retiré
// de la liste de déclenchement, quelle que soit la catégorie où il
// apparaîtrait par erreur — défense en profondeur, pas seulement un
// tri à la source dans central-bank-keywords.js.
//
// Liste noire de phrases standard/disclaimers (ex: FOMC Minutes)
// inchangée depuis le fix précédent.

import { MONETARY_KEYWORDS, BANK_SPECIFIC_KEYWORDS, TRAP_WORDS } from "./central-bank-keywords";

const PHRASES_INTERDITES = [
  "the descriptions of economic and financial conditions contained in these minutes are based solely on",
  "these minutes were approved",
  "voting for this action",
  "voting against this action",
  "committee members' views and the committee's decisions are based on",
];

/**
 * Construit la liste des mots-clés de déclenchement pour une banque,
 * en excluant systématiquement tout mot présent dans TRAP_WORDS — même
 * s'il apparaît par erreur dans une catégorie forte (MONETARY_KEYWORDS
 * ou BANK_SPECIFIC_KEYWORDS). Un mot piège ne déclenche jamais
 * l'inclusion d'une phrase à lui seul (règle B.9) ; si la phrase
 * contient par ailleurs un vrai mot fort, elle passe grâce à ce
 * mot fort, indépendamment du mot piège.
 */
function construireMotsCleSignal(banqueCentrale) {
  const motsPieges = new Set(TRAP_WORDS.map((m) => m.toLowerCase()));

  const motsCategories1a7 = Object.values(MONETARY_KEYWORDS)
    .flat()
    .filter((mot) => !motsPieges.has(mot.toLowerCase()));

  const motsSpecifiquesBanque = (BANK_SPECIFIC_KEYWORDS[banqueCentrale] || [])
    .filter((mot) => !motsPieges.has(mot.toLowerCase()));

  return [...motsCategories1a7, ...motsSpecifiquesBanque];
}

function decouperEnPhrases(texteBrut) {
  const texteNettoye = texteBrut.replace(/\s+/g, " ").trim();
  const phrases = texteNettoye.match(/[^.!?]+[.!?]+(\s+|$)/g) || [texteNettoye];
  return phrases.map((p) => p.trim()).filter((p) => p.length > 0);
}

function contientMotCleSignal(phrase, motsCleSignal) {
  const texte = phrase.toLowerCase();
  return motsCleSignal.some((mot) => texte.includes(mot));
}

function estPhraseInterdite(phrase) {
  const texte = phrase.toLowerCase();
  return PHRASES_INTERDITES.some((fragment) => texte.includes(fragment));
}

export function filtrerParagraphes(texteScrape, banqueCentrale) {
  const motsCleSignal = construireMotsCleSignal(banqueCentrale);
  const phrases = decouperEnPhrases(texteScrape);

  const phrasesRetenues = phrases.filter(
    (p) => contientMotCleSignal(p, motsCleSignal) && !estPhraseInterdite(p)
  );

  return phrasesRetenues;
}
