// lib/macro-consolidator-service.js
//
// FIX ARCHITECTURAL : recupererPublicationsRecentes() lit desormais
// l'historique depuis R2 (lib/calendrier-archive-r2.js) au lieu
// d'interroger Back4App CentralBankCalendar. Back4App n'est plus
// l'entrepot historique croissant - R2 est la seule source de verite,
// mise a jour par fusion, jamais par accumulation illimitee dans une
// table Parse.

import { lireArchiveCalendrier } from "./calendrier-archive-r2";

const KNOWLEDGE_BASE = require("../config/config__macro-knowledge-base.json");

function normaliser(texte) {
  return (texte || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function slugifier(texte) {
  return normaliser(texte).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function construireEventId(devise, nomEvenement) {
  return `${devise}-${slugifier(nomEvenement)}`;
}

function indicateurAppartientAFamille(nomEvenement, def) {
  const nom = normaliser(nomEvenement);
  const tousLesIndicateurs = [...def.primary, ...def.secondary];
  return tousLesIndicateurs.some((ind) => nom.includes(normaliser(ind)));
}

function trouverFamille(nomEvenement) {
  for (const [cleFamille, def] of Object.entries(KNOWLEDGE_BASE.families)) {
    if (indicateurAppartientAFamille(nomEvenement, def)) return cleFamille;
  }
  return null;
}

function estIndicateurPrimaire(nomEvenement, def) {
  const nom = normaliser(nomEvenement);
  return def.primary.some((ind) => nom.includes(normaliser(ind)));
}

function parserValeurNumerique(valeurStr) {
  if (!valeurStr) return null;
  const nettoye = String(valeurStr).replace(/[^0-9.\-KMB]/gi, "");
  const match = nettoye.match(/^(-?\d+\.?\d*)([KMB])?$/i);
  if (!match) return null;
  const [, nombre, suffixe] = match;
  let valeur = parseFloat(nombre);
  if (isNaN(valeur)) return null;
  if (suffixe) {
    const multiplicateurs = { K: 1e3, M: 1e6, B: 1e9 };
    valeur *= multiplicateurs[suffixe.toUpperCase()];
  }
  return valeur;
}

function comparerValeurs(valeurA, valeurB) {
  const a = parserValeurNumerique(valeurA);
  const b = parserValeurNumerique(valeurB);
  if (a === null || b === null) return "non comparable";
  if (a > b) return "superieur";
  if (a < b) return "inferieur";
  return "conforme";
}

function construireComparaisons(reel, consensus, precedent) {
  return {
    surprise: comparerValeurs(reel, consensus),
    evolution: comparerValeurs(reel, precedent),
  };
}

/**
 * Deduplique une liste d'evenements sur (devise+evenement+date). Utile
 * en filet de securite meme si l'archive R2 est deja dedupliquee a
 * l'ecriture (fusionnerDansArchiveCalendrier).
 */
function dedupliquer(evenements) {
  const parCle = new Map();
  for (const e of evenements) {
    const cle = `${e.devise}|${e.evenement}|${e.date}`;
    parCle.set(cle, e);
  }
  return Array.from(parCle.values());
}

/**
 * FIX : lit desormais l'archive R2 complete (lib/calendrier-archive-r2.js)
 * au lieu d'interroger Back4App. Filtre en memoire par devise, famille,
 * fenetre historique - meme logique qu'avant, source differente.
 */
async function recupererPublicationsRecentes({ devise, familleCible, familleLiee, exclureEvenement, exclureDate }) {
  const def = KNOWLEDGE_BASE.families[familleLiee];
  if (!def) return [];

  const archiveComplete = await lireArchiveCalendrier();

  const bornDate = new Date(Date.now() - def.fenetre_historique_jours * 24 * 60 * 60 * 1000);

  const filtres = archiveComplete.filter((e) => {
    if (e.devise !== devise) return false;
    if (!indicateurAppartientAFamille(e.evenement, def)) return false;
    if (!e.reel) return false;
    if (e.evenement === exclureEvenement && e.date === exclureDate) return false;

    const dateEvenement = new Date(e.date);
    if (isNaN(dateEvenement.getTime())) return false;
    return dateEvenement >= bornDate;
  });

  const dedupliques = dedupliquer(filtres);

  return dedupliques
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((e) => ({
      eventId: construireEventId(devise, e.evenement),
      evenement: e.evenement,
      releaseDate: e.date,
      referencePeriod: e.referencePeriod || null,
      reel: e.reel,
      consensus: e.consensus,
      precedent: e.precedent,
      comparaisons: construireComparaisons(e.reel, e.consensus, e.precedent),
      selectionReason: `related_family_${familleCible}_via_${familleLiee}`,
    }));
}

export async function construireContexteMacro(evenementDuJour) {
  const famille = trouverFamille(evenementDuJour.evenement);
  const eventId = construireEventId(evenementDuJour.devise, evenementDuJour.evenement);

  if (!famille) {
    return {
      eventId,
      devise: evenementDuJour.devise,
      publicationDuJour: {
        evenement: evenementDuJour.evenement,
        famille: null,
        releaseDate: evenementDuJour.date,
        referencePeriod: evenementDuJour.referencePeriod || null,
        reel: evenementDuJour.reel,
        consensus: evenementDuJour.consensus,
        precedent: evenementDuJour.precedent,
      },
      contexte: {},
      avertissement: `Indicateur "${evenementDuJour.evenement}" non reconnu dans macro-knowledge-base.json — à ajouter manuellement.`,
    };
  }

  const def = KNOWLEDGE_BASE.families[famille];

  const contexte = {};
  for (const familleLiee of def.confirm_with) {
    contexte[familleLiee] = await recupererPublicationsRecentes({
      devise: evenementDuJour.devise,
      familleCible: famille,
      familleLiee,
      exclureEvenement: evenementDuJour.evenement,
      exclureDate: evenementDuJour.date,
    });
  }

  return {
    eventId,
    devise: evenementDuJour.devise,
    publicationDuJour: {
      evenement: evenementDuJour.evenement,
      famille,
      importance: estIndicateurPrimaire(evenementDuJour.evenement, def) ? "primary" : "secondary",
      releaseDate: evenementDuJour.date,
      referencePeriod: evenementDuJour.referencePeriod || null,
      reel: evenementDuJour.reel,
      consensus: evenementDuJour.consensus,
      precedent: evenementDuJour.precedent,
      comparaisons: construireComparaisons(evenementDuJour.reel, evenementDuJour.consensus, evenementDuJour.precedent),
      sensEconomiqueAttendu: def.sens_economique,
    },
    contexte,
  };
}

export async function construireContexteMacroDuJour(evenementsDuJour) {
  const publies = evenementsDuJour.filter((e) => e.reel);
  return Promise.all(publies.map((e) => construireContexteMacro(e)));
}
