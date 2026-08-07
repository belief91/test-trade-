// lib/macro-consolidator-service.js
//
// Couche mécanique entre le calendrier économique et l'IA. Ne décide
// jamais si une devise est haussière/baissière — se contente de :
//   1. Identifier la famille de l'indicateur du jour (macro-knowledge-base.json)
//   2. Aller chercher les publications récentes des familles liées (confirm_with)
//   3. Dédoublonner (filet de sécurité en plus du fix à l'écriture)
//   4. Construire un JSON structuré { devise, publicationDuJour, contexte }
//
// L'interprétation (confirme/infirme/biais) reste entièrement le travail
// du prompt écrit séparément, qui consomme la sortie de ce module.

import Parse from "./back4app-server";

const KNOWLEDGE_BASE = require("../config/macro-knowledge-base.json");

// ---- Normalisation & matching famille ----

function normaliser(texte) {
  return (texte || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function indicateurAppartientAFamille(nomEvenement, def) {
  const nom = normaliser(nomEvenement);
  const tousLesIndicateurs = [...def.primary, ...def.secondary];
  return tousLesIndicateurs.some((ind) => nom.includes(normaliser(ind)));
}

/**
 * Trouve la famille d'un indicateur par correspondance de sous-chaîne
 * normalisée. Retourne null si aucune famille ne matche (l'indicateur
 * n'est pas encore répertorié dans macro-knowledge-base.json).
 */
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

// ---- Comparaison factuelle (pas de jugement économique — juste le fait) ----

/**
 * Extrait une valeur numérique comparable depuis une chaîne type "80K",
 * "4.2%", "A$-1.1B", "55.6". Retourne null si non parsable.
 */
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

/**
 * Compare "reel" à "consensus" de façon purement factuelle — ne dit
 * jamais si c'est bon ou mauvais pour la devise (ça dépend de
 * l'indicateur, ex: chômage en hausse ≠ ventes au détail en hausse).
 * Cette interprétation reste le travail du prompt.
 */
function comparerVsConsensus(reel, consensus) {
  const r = parserValeurNumerique(reel);
  const c = parserValeurNumerique(consensus);
  if (r === null || c === null) return "non comparable";
  if (r > c) return "superieur au consensus";
  if (r < c) return "inferieur au consensus";
  return "conforme au consensus";
}

// ---- Récupération Back4App (avec dédoublonnage en filet de sécurité) ----

/**
 * Déduplique une liste d'événements sur (devise+evenement+date), garde
 * l'entrée avec l'updatedAt le plus récent. Filet de sécurité en plus du
 * fix à l'écriture (upsertVersBack4App) — utile tant que les doublons
 * historiques n'ont pas tous été nettoyés (scripts/nettoyer-doublons-calendrier.js).
 */
function dedupliquer(objets) {
  const parCle = new Map();
  for (const obj of objets) {
    const cle = `${obj.get("devise")}|${obj.get("evenement")}|${obj.get("date")}`;
    const existant = parCle.get(cle);
    if (!existant || obj.get("updatedAt") > existant.get("updatedAt")) {
      parCle.set(cle, obj);
    }
  }
  return Array.from(parCle.values());
}

/**
 * Récupère les publications récentes d'une famille pour une devise, dans
 * la fenêtre historique définie par la famille (macro-knowledge-base.json),
 * en excluant l'événement du jour lui-même.
 */
async function recupererPublicationsRecentes({ devise, famille, exclureEvenement, exclureDate }) {
  const def = KNOWLEDGE_BASE.families[famille];
  if (!def) return [];

  const CentralBankCalendar = Parse.Object.extend("CentralBankCalendar");
  const requete = new Parse.Query(CentralBankCalendar);
  requete.equalTo("devise", devise);
  requete.limit(500);

  const tous = await requete.find({ useMasterKey: true });

  const bornDate = new Date(Date.now() - def.fenetre_historique_jours * 24 * 60 * 60 * 1000);

  const filtres = tous.filter((obj) => {
    const nomEvenement = obj.get("evenement");
    const dateTexte = obj.get("date");
    const reel = obj.get("reel");

    if (!indicateurAppartientAFamille(nomEvenement, def)) return false;
    if (!reel) return false; // pas encore publié — pas exploitable comme contexte
    if (nomEvenement === exclureEvenement && dateTexte === exclureDate) return false;

    const dateEvenement = new Date(dateTexte);
    if (isNaN(dateEvenement.getTime())) return false; // date non parsable, on exclut par sécurité
    return dateEvenement >= bornDate;
  });

  const dedupliques = dedupliquer(filtres);

  return dedupliques
    .sort((a, b) => new Date(b.get("date")) - new Date(a.get("date")))
    .map((obj) => ({
      evenement: obj.get("evenement"),
      date: obj.get("date"),
      reel: obj.get("reel"),
      consensus: obj.get("consensus"),
      precedent: obj.get("precedent"),
    }));
}

// ---- Fonction principale ----

/**
 * Construit le contexte macro consolidé pour un événement du jour donné.
 *
 * @param {{date:string, heureGmt3:string, devise:string, evenement:string, reel:string, precedent:string, consensus:string, prevision:string}} evenementDuJour
 * @returns {Promise<object>} { devise, publicationDuJour, contexte } ou un objet avec `avertissement` si l'indicateur n'est pas reconnu
 */
export async function construireContexteMacro(evenementDuJour) {
  const famille = trouverFamille(evenementDuJour.evenement);

  if (!famille) {
    return {
      devise: evenementDuJour.devise,
      publicationDuJour: {
        evenement: evenementDuJour.evenement,
        famille: null,
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
      famille: familleLiee,
      exclureEvenement: evenementDuJour.evenement,
      exclureDate: evenementDuJour.date,
    });
  }

  return {
    devise: evenementDuJour.devise,
    publicationDuJour: {
      evenement: evenementDuJour.evenement,
      famille,
      importance: estIndicateurPrimaire(evenementDuJour.evenement, def) ? "primary" : "secondary",
      reel: evenementDuJour.reel,
      consensus: evenementDuJour.consensus,
      precedent: evenementDuJour.precedent,
      surpriseVsConsensus: comparerVsConsensus(evenementDuJour.reel, evenementDuJour.consensus),
      sensEconomiqueAttendu: def.sens_economique,
    },
    contexte,
  };
}

/**
 * Construit le contexte macro pour TOUS les événements déjà publiés
 * aujourd'hui (reel non vide), pour toutes devises confondues.
 *
 * @param {Array<object>} evenementsDuJour — sortie de recupererDonneesCalendrier()
 * @returns {Promise<Array<object>>}
 */
export async function construireContexteMacroDuJour(evenementsDuJour) {
  const publies = evenementsDuJour.filter((e) => e.reel);
  return Promise.all(publies.map((e) => construireContexteMacro(e)));
}
