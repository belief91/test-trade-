// lib/bc-state/bc-state.js
//
// Table bc_state - memoire de la derniere analyse IA. C'est cette table
// qui permet a l'IA de comparer sa conclusion d'hier a celle d'aujourd'hui
// au lieu de repartir de zero a chaque synthese.
//
// L'ecriture (mettreAJourBcState) accepte un objet deja construit par
// l'appel IA en amont — ce module ne fait aucun appel IA lui-meme, ne
// decide d'aucun biais : il ne fait que persister/lire l'etat, le
// contenu analytique (biais, conviction, prompt) reste entierement le
// travail separe deja etabli pour ce projet.

import { lireJSONDepuisR2, ecrireJSONDansR2 } from "../r2-client.js";

function cleR2State(banque) {
  return `test/bc-state/${banque}.json`;
}

export async function lireBcState(banque) {
  try {
    return await lireJSONDepuisR2(cleR2State(banque));
  } catch {
    return null; // pas encore d'etat - premiere analyse pour cette banque
  }
}

/**
 * Persiste un nouvel etat BC, en conservant l'etat precedent sous
 * `etatPrecedent` pour tracabilite (permet de voir l'evolution
 * biais-a-biais sans requeter un historique separe).
 *
 * @param {string} banque
 * @param {object} nouvelEtat - { devise, dateAnalyse, biais, conviction,
 *   cap, positionActuelle, reactionFuture, dernierSignal, evolution }
 *   deja construit par l'appel IA en amont — ce module ne le valide pas
 *   au-dela de la presence du champ dateAnalyse.
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

  await ecrireJSONDansR2(cleR2State(banque), etatComplet);

  return etatComplet;
}
