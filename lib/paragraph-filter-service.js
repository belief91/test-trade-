// lib/paragraph-filter-service.js
// Filtre le texte scrapé PHRASE PAR PHRASE (pas paragraphe entier).
// Règle des mots pièges INCHANGÉE : ignorés si absents des catégories 1-8.
//
// AJOUT : liste noire de phrases standard/disclaimers qui reviennent
// systématiquement sur certains documents (ex: FOMC Minutes) et qui
// contiennent des mots-clés monétaires génériques sans porter
// d'information substantielle. Confirmé par un cas réel : le disclaimer
// standard des FOMC Minutes a été retenu SEUL comme unique phrase du
// document — signe que le scraper n'a peut-être récupéré que peu de
// contenu réel, à vérifier séparément côté scraperFed.js. Cette liste
// noire reste une protection utile même une fois le scraper corrigé.

import { MONETARY_KEYWORDS, BANK_SPECIFIC_KEYWORDS } from "./central-bank-keywords";

const PHRASES_INTERDITES = [
  "the descriptions of economic and financial conditions contained in these minutes are based solely on",
  "these minutes were approved",
  "voting for this action",
  "voting against this action",
  "committee members' views and the committee's decisions are based on",
];

function construireMotsCleSignal(banqueCentrale) {
  const motsCategories1a7 = Object.values(MONETARY_KEYWORDS).flat();
  const motsSpecifiquesBanque = BANK_SPECIFIC_KEYWORDS[banqueCentrale] || [];
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
