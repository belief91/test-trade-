// lib/macro-consolidator-service.js
//
// FIX ARCHITECTURAL : recupererPublicationsRecentes() lit desormais
// l'historique depuis R2 (lib/calendrier-archive-r2.js) au lieu
// d'interroger Back4App CentralBankCalendar.
//
// FIX PERF (26/08) : l'archive R2 est lue UNE SEULE FOIS par execution
// (dans construireContexteMacroDuJour), passee en parametre partout
// ensuite, au lieu d'etre relue a chaque famille liee x evenement.
//
// FIX VOLUME #1 (27/08) : un seul point par indicateur distinct (le plus
// recent dans la fenetre), au lieu de toutes les occurrences.
//
// FIX VOLUME #2 (27/08) : LA VRAIE SOURCE DU GONFLEMENT. Sur
// raw/2026-08-27/calendrier-consolide.json reel (5 evenements publies le
// meme jour), chaque famille liee etait recalculee ET REINSEREE EN
// INTEGRALITE pour CHAQUE evenement qui la referencait via confirm_with.
// Exemple mesure avec config/config__macro-knowledge-base.json reel :
// "employment" est dans le confirm_with de inflation, growth ET
// consumption -> son bloc de contexte (identique a chaque fois) etait
// recopie 5 fois sur 5 evenements publies ce jour-la. "consumption"
// pareil (5x), "growth" et "activity" 4x chacun. Le fix #1 reduisait la
// taille de CHAQUE bloc ; celui-ci elimine la repetition du meme bloc
// entre evenements soeurs du meme jour.
//
// Architecture : contexteMacroDuJour() calcule maintenant chaque famille
// UNE SEULE FOIS par jour (Set des familles necessaires = union de tous
// les confirm_with des evenements publies), et chaque evenement ne porte
// plus qu'une liste de NOMS de familles liees ("famillesLiees"), a
// resoudre cote consommateur via le nouveau bloc partage
// "contextePartage" (voir app/api/central-bank-calendar/route.js et
// lib/ai-synthesis-service.js, modifies dans le meme commit).
//
// Compromis assume : l'ancienne exclusion (exclureEvenement/exclureDate,
// qui empechait un evenement de se retrouver dans son PROPRE contexte)
// disparait au niveau du calcul partage, puisqu'il n'est plus rattache a
// un evenement precis. Risque residuel negligeable : l'archive lue ici
// est celle d'AVANT la fusion du jour (fusionnerDansArchiveCalendrier
// tourne apres), donc les evenements du jour meme n'y figurent pas
// encore lors d'une execution normale. Seul un re-declenchement manuel
// le meme jour, apres une fusion deja faite, pourrait faire apparaitre
// un evenement dans son propre contexte partage — cas rare, sans
// consequence grave (une ligne de plus, pas une erreur).

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
 * Ne garde qu'UNE occurrence par indicateur distinct (devise+evenement,
 * indépendamment de la date) — la plus récente dans la fenêtre.
 */
function garderPlusRecentParIndicateur(evenements) {
  const parIndicateur = new Map();

  for (const e of evenements) {
    const cle = `${e.devise}|${normaliser(e.evenement)}`;
    const existant = parIndicateur.get(cle);
    if (!existant || new Date(e.date) > new Date(existant.date)) {
      parIndicateur.set(cle, e);
    }
  }

  return Array.from(parIndicateur.values());
}

/**
 * Calcule le contexte d'une famille liée UNE FOIS (plus d'exclusion par
 * événement précis — voir note en tête de fichier). Utilisé désormais
 * une seule fois par famille nécessaire dans la journée, jamais par
 * (événement x famille).
 */
function calculerContextePourFamille({ devise, familleLiee, archiveComplete }) {
  const def = KNOWLEDGE_BASE.families[familleLiee];
  if (!def) return [];

  const bornDate = new Date(Date.now() - def.fenetre_historique_jours * 24 * 60 * 60 * 1000);

  const filtres = archiveComplete.filter((e) => {
    if (e.devise !== devise) return false;
    if (!indicateurAppartientAFamille(e.evenement, def)) return false;
    if (!e.reel) return false;

    const dateEvenement = new Date(e.date);
    if (isNaN(dateEvenement.getTime())) return false;
    return dateEvenement >= bornDate;
  });

  const plusRecentParIndicateur = garderPlusRecentParIndicateur(filtres);

  return plusRecentParIndicateur
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
    }));
}

function construirePublicationDuJour(evenementDuJour, famille, def) {
  return {
    evenement: evenementDuJour.evenement,
    famille: famille || null,
    importance: famille ? (estIndicateurPrimaire(evenementDuJour.evenement, def) ? "primary" : "secondary") : null,
    releaseDate: evenementDuJour.date,
    referencePeriod: evenementDuJour.referencePeriod || null,
    reel: evenementDuJour.reel,
    consensus: evenementDuJour.consensus,
    precedent: evenementDuJour.precedent,
    comparaisons: construireComparaisons(evenementDuJour.reel, evenementDuJour.consensus, evenementDuJour.precedent),
    sensEconomiqueAttendu: def ? def.sens_economique : null,
  };
}

/**
 * FIX VOLUME #2 (27/08) : chaque famille liée nécessaire dans la journée
 * est calculée UNE SEULE FOIS (Set dédupliqué), quel que soit le nombre
 * d'événements du jour qui la référencent via confirm_with. Chaque
 * événement ne porte plus qu'une liste de noms de familles
 * ("famillesLiees") ; le détail est dans "contextePartage", au même
 * niveau que "data" dans le JSON final — à résoudre côté consommateur.
 *
 * Retour : { contextePartage, evenements } — voir
 * app/api/central-bank-calendar/route.js pour l'écriture R2
 * correspondante, et lib/ai-synthesis-service.js pour la lecture.
 */
export async function construireContexteMacroDuJour(evenementsDuJour) {
  const publies = evenementsDuJour.filter((e) => e.reel);
  const archiveComplete = await lireArchiveCalendrier();

  // 1. Determiner la famille de chaque evenement publie, et l'union de
  //    toutes les familles liees necessaires ce jour (par devise, car le
  //    contexte d'une famille est specifique a une devise).
  const famillesNecessaires = new Map(); // cle: "devise|familleLiee" -> {devise, familleLiee}
  const evenementsAnnotes = publies.map((e) => {
    const famille = trouverFamille(e.evenement);
    const def = famille ? KNOWLEDGE_BASE.families[famille] : null;
    const famillesLiees = def ? def.confirm_with : [];

    for (const fl of famillesLiees) {
      famillesNecessaires.set(`${e.devise}|${fl}`, { devise: e.devise, familleLiee: fl });
    }

    return { evenementDuJour: e, famille, def, famillesLiees };
  });

  // 2. Calculer chaque famille necessaire UNE SEULE FOIS.
  const contextePartage = {};
  for (const { devise, familleLiee } of famillesNecessaires.values()) {
    const cle = familleLiee; // une seule devise traitee par ce script (calendrier G10 mais un run = une devise dominante par evenement) — si plusieurs devises partagent une meme familleLiee, chaque devise a sa propre entree ci-dessous
    if (!contextePartage[cle]) contextePartage[cle] = {};
    contextePartage[cle][devise] = calculerContextePourFamille({ devise, familleLiee, archiveComplete });
  }

  // 3. Construire la liste des evenements, avec reference aux familles
  //    (plus de duplication du contenu).
  const evenements = evenementsAnnotes.map(({ evenementDuJour, famille, def, famillesLiees }) => {
    if (!famille) {
      return {
        eventId: construireEventId(evenementDuJour.devise, evenementDuJour.evenement),
        devise: evenementDuJour.devise,
        publicationDuJour: construirePublicationDuJour(evenementDuJour, null, null),
        famillesLiees: [],
        avertissement: `Indicateur "${evenementDuJour.evenement}" non reconnu dans macro-knowledge-base.json — à ajouter manuellement.`,
      };
    }

    return {
      eventId: construireEventId(evenementDuJour.devise, evenementDuJour.evenement),
      devise: evenementDuJour.devise,
      publicationDuJour: construirePublicationDuJour(evenementDuJour, famille, def),
      famillesLiees,
    };
  });

  return { contextePartage, evenements };
}
