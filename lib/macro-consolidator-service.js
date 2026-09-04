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
// e.date === aujourd'hui (calcule via l'horloge, GMT+3), au lieu de
// garder n'importe quel evenement deja publie cette semaine.
//
// FIX CRITIQUE #2 (03/09) : la version du 02/09 comparait a la date de
// L'HORLOGE au moment de l'execution, pas a la date VOULUE du cron. Le
// cron calendrier-bc est prevu a 18h45 UTC (21h45 GMT+3), mais
// GitHub Actions l'a lance avec 2h52 de retard (21h37 UTC reel), soit
// 00h37 GMT+3 — APRES MINUIT. A ce moment, "aujourd'hui" selon
// l'horloge etait deja le jour suivant, alors qu'aucun evenement de ce
// jour suivant n'avait encore de valeur publiee (ils sont prevus l'apres-
// midi). Resultat confirme sur un cas reel : calendrier-consolide.json
// vide (count:0) alors que calendrier-bc.json contenait bien 2 vrais
// evenements publies la veille (AUD balance commerciale, USD ISM
// services PMI) qui auraient du etre traites.
//
// Corrige definitivement : au lieu de comparer a la date de l'horloge
// (fragile face a tout retard de cron qui franchit minuit GMT+3), on
// prend la date la PLUS RECENTE parmi les evenements qui ont reellement
// une valeur publiee dans le scrape du jour. Le calendrier etant
// intrinsequement tourne vers l'avenir ("This Week"), les evenements
// avec une valeur reelle sont toujours dans le passe recent par rapport
// aux evenements encore a venir — cette date est donc fiable quelle que
// soit l'heure exacte d'execution du cron.

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
 * FIX CRITIQUE #2 (03/09) : remplace dateAujourdhuiGMT3() (basée sur
 * l'horloge, fragile). Prend la date la plus récente parmi les
 * événements ayant une valeur "reel" non vide — insensible aux retards
 * de cron qui franchissent minuit GMT+3.
 */
function derniereDatePubliee(evenements) {
  const datesAvecReel = evenements
    .filter((e) => e.reel)
    .map((e) => ({ str: e.date, ts: new Date(e.date).getTime() }))
    .filter((d) => !isNaN(d.ts));

  if (datesAvecReel.length === 0) return null;

  datesAvecReel.sort((a, b) => b.ts - a.ts);
  return datesAvecReel[0].str;
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
 * FIX CRITIQUE #2 (03/09) : "publies" filtre maintenant sur e.reel ET
 * e.date === la date la PLUS RECENTE ayant une valeur publiee dans ce
 * scrape (derniereDatePubliee), au lieu de la date de l'horloge au
 * moment de l'execution. Corrige le cas confirme ou un retard de cron
 * franchissant minuit GMT+3 faisait passer "aujourd'hui" au jour
 * suivant, avant que les evenements de ce jour suivant aient une
 * valeur publiee — vidant le fichier alors que de vrais evenements de
 * la veille attendaient d'etre traites.
 */
export async function construireContexteMacroDuJour(evenementsDuJour) {
  const dateCible = derniereDatePubliee(evenementsDuJour);
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

  return { contextePartage, evenements };
}
