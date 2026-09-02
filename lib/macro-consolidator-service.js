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
// FIX DATE DU JOUR (02/09) : LA VRAIE ERREUR RESTANTE. evenementsDuJour
// contient TOUTE la semaine scrapee ("This Week" TradingEconomics), pas
// seulement aujourd'hui. L'ancien filtre `.filter(e => e.reel)` gardait
// N'IMPORTE QUEL evenement deja publie cette semaine, meme si publie 3
// jours plus tot. Confirme sur raw/2026-09-02/calendrier-consolide.json
// reel : genere le mardi 2 septembre, mais 4 evenements sur 5 dans
// "data" datent du 1er septembre (hier), un seul (AUD GDP) date bien
// d'aujourd'hui. Consequence : la synthese IA du jour re-presentait des
// publications deja traitees et synthetisees la veille, comme si
// c'etait une actualite du jour.
//
// Corrige : "publies" filtre desormais sur e.reel ET e.date ===
// aujourd'hui (meme format de date que le reste du projet, genere par
// dateAujourdhuiGMT3()). Le contexte historique par famille
// (calculerContextePourFamille, fenetre_historique_jours) continue de
// regarder large dans l'archive — c'est voulu, seule la liste des
// "publications du jour" en tete de fichier doit etre strictement
// datee d'aujourd'hui.

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

/**
 * Date du jour au format "Weekday Month D YYYY" en GMT+3 — même format
 * que le champ `date` produit par le scraper de calendrier
 * (lib/central-bank-calendar-service.js) et que dateAujourdhuiMadagascar()
 * dans lib/central-bank-pipeline-service.js. Doit rester identique pour
 * que la comparaison de chaînes fonctionne.
 */
function dateAujourdhuiGMT3() {
  const maintenant = new Date();
  const options = { timeZone: "Indian/Antananarivo" };
  const weekday = maintenant.toLocaleDateString("en-US", { ...options, weekday: "long" });
  const month = maintenant.toLocaleDateString("en-US", { ...options, month: "long" });
  const day = parseInt(maintenant.toLocaleDateString("en-US", { ...options, day: "numeric" }), 10);
  const year = maintenant.toLocaleDateString("en-US", { ...options, year: "numeric" });
  return `${weekday} ${month} ${day} ${year}`;
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
 * toute la fenêtre (fenetre_historique_jours), pas seulement
 * aujourd'hui. C'est la LISTE DES PUBLICATIONS DU JOUR (plus bas) qui
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
 * FIX DATE DU JOUR (02/09) : "publies" filtre maintenant sur e.reel ET
 * e.date === aujourd'hui. Avant, n'importe quel evenement deja publie
 * dans la semaine scrapee ("This Week") etait repris chaque jour tant
 * qu'il avait un "reel" rempli — confirme sur un cas reel ou 4
 * evenements de la veille apparaissaient dans le fichier du jour.
 */
export async function construireContexteMacroDuJour(evenementsDuJour) {
  const aujourdhui = dateAujourdhuiGMT3();
  const publies = evenementsDuJour.filter((e) => e.reel && e.date === aujourdhui);
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

  return { contextePartage, evenements };
}
