// lib/macro-consolidator-service.js
//
// MISE À JOUR — 6 changements demandés :
//   1. Aucun jugement hawkish/dovish généré ici (déjà le cas pour
//      comparerVsConsensus ; sensEconomiqueAttendu vient de TON fichier
//      config__macro-knowledge-base.json — à vérifier séparément)
//   2. eventId stable par indicateur (devise + nom normalisé), pour
//      suivre une série dans le temps sans dépendre du matching flou
//   3. releaseDate + referencePeriod exposés explicitement
//      (referencePeriod = null si le scraper live ne capture pas cette
//      colonne — non vérifié, à confirmer sur le HTML TradingEconomics)
//   4. Comparaisons factuelles doubles : { surprise, evolution }
//      (vs consensus ET vs précédent), toujours en mots factuels
//   5. selectionReason sur chaque publication de contexte — explique
//      pourquoi le script l'a choisie
//   6. Architecture confirmée : SCRAPER -> NORMALISATION -> CONSOLIDATEUR
//      -> CONTEXTE MACRO -> IA -> NARRATIF -> BIAIS+CONFIANCE. Ce fichier
//      ne produit jamais de BIAIS, uniquement des faits comparés.

import Parse from "./back4app-server";

const KNOWLEDGE_BASE = require("../config/config__macro-knowledge-base.json");

// ---- Normalisation & matching famille ----

function normaliser(texte) {
  return (texte || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function slugifier(texte) {
  return normaliser(texte).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * Identifiant stable d'une série d'indicateur, indépendant de la date de
 * publication : permet de suivre "US CPI YoY" comme UNE série dans le
 * temps plutôt que comme des événements isolés à chaque republication
 * mensuelle.
 */
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

// ---- Comparaison factuelle (pas de jugement économique — juste le fait) ----

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
 * Compare deux valeurs de façon purement factuelle. Retourne un mot
 * neutre décrivant la direction, jamais un jugement (jamais "positif"/
 * "négatif"/"hawkish"/"dovish" — l'interprétation reste au prompt IA).
 */
function comparerValeurs(valeurA, valeurB) {
  const a = parserValeurNumerique(valeurA);
  const b = parserValeurNumerique(valeurB);
  if (a === null || b === null) return "non comparable";
  if (a > b) return "superieur";
  if (a < b) return "inferieur";
  return "conforme";
}

/**
 * Construit le bloc de comparaisons factuelles demandé :
 * { surprise: reel vs consensus, evolution: reel vs precedent }
 */
function construireComparaisons(reel, consensus, precedent) {
  return {
    surprise: comparerValeurs(reel, consensus), // reel vs consensus
    evolution: comparerValeurs(reel, precedent), // reel vs precedent
  };
}

// ---- Récupération Back4App (avec dédoublonnage en filet de sécurité) ----

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
 * Récupère les publications récentes d'une famille pour une devise.
 * Chaque publication porte désormais selectionReason, expliquant
 * pourquoi le script l'a incluse dans ce contexte.
 */
async function recupererPublicationsRecentes({ devise, familleCible, familleLiee, exclureEvenement, exclureDate }) {
  const def = KNOWLEDGE_BASE.families[familleLiee];
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
    if (!reel) return false;
    if (nomEvenement === exclureEvenement && dateTexte === exclureDate) return false;

    const dateEvenement = new Date(dateTexte);
    if (isNaN(dateEvenement.getTime())) return false;
    return dateEvenement >= bornDate;
  });

  const dedupliques = dedupliquer(filtres);

  return dedupliques
    .sort((a, b) => new Date(b.get("date")) - new Date(a.get("date")))
    .map((obj) => {
      const evenement = obj.get("evenement");
      const dateTexte = obj.get("date");
      const reel = obj.get("reel");
      const consensus = obj.get("consensus");
      const precedent = obj.get("precedent");

      return {
        eventId: construireEventId(devise, evenement),
        evenement,
        releaseDate: dateTexte,
        referencePeriod: obj.get("referencePeriod") || null, // null si non capturé par le scraper live — voir note en tête de fichier
        reel,
        consensus,
        precedent,
        comparaisons: construireComparaisons(reel, consensus, precedent),
        selectionReason: `related_family_${familleCible}_via_${familleLiee}`,
      };
    });
}

// ---- Fonction principale ----

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
      // sensEconomiqueAttendu vient de config__macro-knowledge-base.json —
      // vérifier ce fichier séparément si des labels hawkish/dovish y figurent.
      sensEconomiqueAttendu: def.sens_economique,
    },
    contexte,
  };
}

export async function construireContexteMacroDuJour(evenementsDuJour) {
  const publies = evenementsDuJour.filter((e) => e.reel);
  return Promise.all(publies.map((e) => construireContexteMacro(e)));
}
