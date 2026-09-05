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
// FIX CRITIQUE #2 et #3 (02-04/09) : plusieurs tentatives de deviner
// "aujourd'hui" (horloge, puis derniere date publiee, puis repli d'1
// jour) — toutes fragiles face aux retards recurrents de GitHub Actions
// (confirme 3 fois en une semaine). Chaque tentative deplacait le
// probleme sans le resoudre.
//
// FIX CRITIQUE #4 (05/09) : ABANDON de toute logique basee sur
// l'horloge pour decider quels evenements sont "du jour". Remplace par
// un suivi persistant des evenements deja traites (voir
// lib/calendrier-archive-r2.js) : un evenement (devise+evenement+date)
// n'est retenu que la PREMIERE fois qu'il a une valeur publiee, peu
// importe l'heure ou le jour calendaire ou le script s'execute. Plus
// aucune dependance a l'horloge pour cette decision -> immunise
// definitivement contre les retards de cron, quels qu'ils soient.

import { lireArchiveCalendrier, lireEvenementsDejaTraites, cleEvenement } from "./calendrier-archive-r2";

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
 * Contexte historique par famille — continue de regarder toute la
 * fenêtre (fenetre_historique_jours). Cette partie n'a jamais été le
 * problème, elle reste inchangée.
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
 * FIX CRITIQUE #4 (05/09) : "publies" ne dépend plus d'aucune horloge.
 * Un événement est retenu s'il a une valeur publiée ET que sa clé
 * (devise+evenement+date) n'a JAMAIS été traitée auparavant — peu
 * importe l'heure ou le jour calendaire d'exécution du script. Les
 * clés traitées sont enregistrées à la fin (voir route appelante) pour
 * ne jamais re-proposer le même événement deux fois.
 */
export async function construireContexteMacroDuJour(evenementsDuJour) {
  const dejaTraites = await lireEvenementsDejaTraites();

  const publies = evenementsDuJour.filter(
    (e) => e.reel && !dejaTraites.has(cleEvenement(e))
  );

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

  // Clés à marquer comme traitées — l'appelant (route.js) les persiste
  // APRÈS avoir confirmé l'écriture R2 réussie, jamais avant.
  const clesTraitees = publies.map((e) => cleEvenement(e));

  return { contextePartage, evenements, clesTraitees };
}
