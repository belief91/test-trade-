// lib/bc-state/bc-state.js
//
// Table bc_state - memoire de la derniere analyse IA. C'est cette table
// qui permet a l'IA de comparer sa conclusion d'hier a celle d'aujourd'hui
// au lieu de repartir de zero a chaque synthese, et qui alimente la
// synthese de production (lib/bc-state/bc-contexte.js).
//
// L'ecriture (mettreAJourBcState) accepte un objet deja construit par
// l'appel IA en amont - ce module ne fait aucun appel IA lui-meme.
//
// JOURNAL : chaque etat ecrit est aussi ajoute a
// database/bc/state-historique/{banque}.json (compact, 365 entrees max).
// "Sans ecraser l'ancien" : l'etat courant est remplace, mais la trajectoire
// reste consultable. L'echec du journal ne bloque jamais l'ecriture de l'etat.
//
// Chemins R2 : voir bc-chemins.js (database/bc/state/, repli sur
// test/bc-state/). Lecture stricte : seule une cle absente vaut "null".

import { ecrireJSONDansR2 } from "../r2-client.js";
import {
  cleBcState,
  cleAncienneBcState,
  cleBcHistorique,
  lireAvecRepli,
  estCleAbsente,
} from "./bc-chemins.js";

const HISTORIQUE_MAX = 365;

export async function lireBcState(banque) {
  try {
    return await lireAvecRepli(cleBcState(banque), cleAncienneBcState(banque));
  } catch (err) {
    if (estCleAbsente(err)) return null; // premiere analyse pour cette banque
    throw err; // jamais de faux "premiere analyse" sur une panne R2
  }
}

async function ajouterAuHistorique(banque, etat) {
  try {
    let historique = [];
    try {
      const contenu = await lireAvecRepli(cleBcHistorique(banque), null);
      historique = contenu.historique || [];
    } catch (err) {
      if (!estCleAbsente(err)) throw err; // lecture en echec : on n'ecrase pas le journal
    }

    historique.push({
      dateAnalyse: etat.dateAnalyse,
      ecritLe: etat.updatedAt,
      biais: etat.biais,
      conviction: etat.conviction,
      cap: etat.cap,
      dernierSignal: etat.dernierSignal,
      evolution: etat.evolution,
      referenceDateUtilisee: etat.referenceDateUtilisee || null,
      modele: etat.modele || null,
      verificationPreuves: etat.verificationPreuves || null,
      nbDocumentsAnalyses: Array.isArray(etat.documentsAnalyses) ? etat.documentsAnalyses.length : null,
    });

    const garde = historique.slice(-HISTORIQUE_MAX);
    await ecrireJSONDansR2(cleBcHistorique(banque), {
      banque,
      updatedAt: new Date().toISOString(),
      count: garde.length,
      historique: garde,
    });
  } catch (err) {
    console.error(`[bc-state] journal non ecrit pour ${banque} :`, err.message);
  }
}

/**
 * Persiste un nouvel etat BC, en conservant l'etat precedent sous
 * `etatPrecedent` pour tracabilite, et ajoute une ligne au journal.
 *
 * @param {string} banque
 * @param {object} nouvelEtat - { devise, dateAnalyse, biais, conviction,
 *   cap, positionActuelle, reactionFuture, dernierSignal, evolution, ... }
 *   deja construit par l'appel IA en amont ; seul dateAnalyse est exige.
 */
export async function mettreAJourBcState(banque, nouvelEtat) {
  if (!nouvelEtat.dateAnalyse) {
    throw new Error("mettreAJourBcState : le champ dateAnalyse est obligatoire");
  }

  const etatPrecedent = await lireBcState(banque);

  const etatComplet = {
    banque,
    ...nouvelEtat,
    etatPrecedent: etatPrecedent
      ? {
          dateAnalyse: etatPrecedent.dateAnalyse,
          biais: etatPrecedent.biais,
          conviction: etatPrecedent.conviction,
          cap: etatPrecedent.cap,
        }
      : null,
    updatedAt: new Date().toISOString(),
  };

  await ecrireJSONDansR2(cleBcState(banque), etatComplet);
  await ajouterAuHistorique(banque, etatComplet);

  return etatComplet;
}
