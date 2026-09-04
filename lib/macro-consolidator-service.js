// lib/macro-consolidator-service.js
//
// FIX ARCHITECTURAL : recupererPublicationsRecentes() lit desormais
// l'historique depuis R2 (lib/calendrier-archive-r2.js) au lieu
// d'interroger Back4App CentralBankCalendar.
//
// FIX PERF (26/08) : l'archive R2 est lue UNE SEULE FOIS par execution.
//
// FIX VOLUME #1 et #2 (27/08) : un seul point par indicateur distinct,
// et chaque famille liee calculee UNE SEULE FOIS par jour au lieu
// d'etre repetee pour chaque evenement qui la reference.
//
// FIX DATE DU JOUR (02/09) : premiere version — filtrer "publies" sur
// e.date === aujourd'hui (horloge GMT+3).
//
// FIX CRITIQUE #2 (03/09) : la version du 02/09 cassait si le cron
// franchissait minuit GMT+3 en retard — remplacee par "la date la plus
// recente ayant une vraie valeur publiee", peu importe l'horloge.
//
// FIX CRITIQUE #3 (04/09) : la version du 03/09 corrige le retard de
// cron mais introduit un NOUVEAU risque, plus insidieux — si un jour
// n'a AUCUN evenement de banque centrale prevu (frequent), le script
// remonte alors indefiniment a la derniere date connue avec des
// donnees, potentiellement plusieurs jours en arriere. Les MEMES
// evenements pourraient alors reapparaitre comme "publication du jour"
// plusieurs jours de suite, comme si c'etait une actualite fraiche
// alors que la synthese IA les a deja vus et traites.
//
// Corrige : retour a l'horloge (GMT+3) comme reference PRINCIPALE — la
// bonne reponse la grande majorite du temps. Si aujourd'hui n'a encore
// aucune donnee publiee (le cas du retard de cron), on ne recule que
// D'UN SEUL JOUR MAXIMUM, jamais plus loin — assez pour couvrir un
// retard de cron qui franchit minuit, sans risquer de faire reapparaitre
// de vieilles donnees plusieurs jours d'affilee. Le champ
// "dateUtiliseeEnFallback" dans la sortie indique explicitement quand
// ce repli a ete utilise, pour que ce soit visible sans creuser les logs.

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

function dateGMT3(date) {
  const options = { timeZone: "Indian/Antananarivo" };
  const weekday = date.toLocaleDateString("en-US", { ...options, weekday: "long" });
  const month = date.toLocaleDateString("en-US", { ...options, month: "long" });
  const day = parseInt(date.toLocaleDateString("en-US", { ...options, day: "numeric" }), 10);
  const year = date.toLocaleDateString("en-US", { ...options, year: "numeric" });
  return `${weekday} ${month} ${day} ${year}`;
}

/**
 * FIX CRITIQUE #3 (04/09) : détermine la date cible avec repli borné à
 * UN SEUL jour maximum. Retourne { date, enFallback } :
 *   1. Aujourd'hui (horloge GMT+3) — si des événements de ce jour ont
 *      une valeur "reel" publiée, on l'utilise, enFallback: false.
 *   2. Sinon, hier (aujourd'hui - 1 jour) — si CE jour-là a des
 *      événements avec valeur publiée, on l'utilise, enFallback: true.
 *   3. Sinon, aucune date cible (null) — rien à traiter, on ne remonte
 *      jamais plus loin qu'hier.
 */
function determinerDateCible(evenements) {
  const maintenant = new Date();
  const aujourdhui = dateGMT3(maintenant);
  const hier = dateGMT3(new Date(maintenant.getTime() - 24 * 60 * 60 * 1000));

  const aUneValeurPubliee = (dateStr) =>
    evenements.some((e) => e.date === dateStr && e.reel);

  if (aUneValeurPubliee(aujourdhui)) {
    return { date: aujourdhui, enFallback: false };
  }
  if (aUneValeurPubliee(hier)) {
    return { date: hier, enFallback: true };
  }
  return { date: null, enFallback: false };
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
 * Contexte historique par famille — continue volontairement de regarder
 * toute la fenêtre (fenetre_historique_jours), pas seulement la date
 * cible du jour. C'est la LISTE DES PUBLICATIONS DU JOUR (plus bas) qui
 * doit être stricte, pas le contexte.
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
 * FIX CRITIQUE #3 (04/09) : determinerDateCible() borne le repli a UN
 * SEUL jour en arriere maximum — corrige le retard de cron sans risquer
 * de refaire remonter de vieilles publications plusieurs jours de
 * suite comme si c'etait une actualite fraiche.
 */
export async function construireContexteMacroDuJour(evenementsDuJour) {
  const { date: dateCible, enFallback } = determinerDateCible(evenementsDuJour);
  const publies = dateCible ? evenementsDuJour.filter((e) => e.reel && e.date === dateCible) : [];
  const archiveComplete = await lireArchiveCalendrier();

  const famillesNecessaires = new Map();
  const evenementsAnnotes = publies.map((e) => {
    const famille = trouverFamille(e.evenement);
    const def = famille ? KNOWLEDGE_BASE.families[famille] : null;
    const famillesLiees = def ? def.confirm_with : [];

    for (const fl of famillesLiees) {
      famillesNecessaires.set(`${e.devise}|${fl}`, { devise: e.devise, familleLiee: fl });
    }

    return { evenementDuJour: e, famille, def, famillesLiees };
  });

  const contextePartage = {};
  for (const { devise, familleLiee } of famillesNecessaires.values()) {
    const cle = familleLiee;
    if (!contextePartage[cle]) contextePartage[cle] = {};
    contextePartage[cle][devise] = calculerContextePourFamille({ devise, familleLiee, archiveComplete });
  }

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

  return { contextePartage, evenements, dateCible, dateUtiliseeEnFallback: enFallback };
}
