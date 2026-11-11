// lib/bc-state/bc-chemins.js
//
// Chemins R2 de l'etat BC, hors du prefixe "test/" du prototype :
//
//   database/bc/documents/{banque}.json         documents dedupliques
//   database/bc/reference/{banque}.json         dernier cycle de decision
//   database/bc/state/{banque}.json             etat courant (analyse IA)
//   database/bc/state-historique/{banque}.json  journal des etats ecrits
//
// MIGRATION SANS OPERATION : la lecture essaie le nouveau chemin et, SEULEMENT
// si la cle est absente, l'ancien chemin test/... du prototype. L'ecriture va
// toujours vers le nouveau. A la premiere ecriture, tout l'existant est donc
// reporte tel quel, sans script ni risque de perte. Les anciennes cles ne sont
// jamais supprimees (sauvegarde).
//
// LECTURES STRICTES : seule une cle ABSENTE (NoSuchKey / 404) est traitee comme
// "rien d'enregistre". Toute autre erreur (reseau, droits, R2 indisponible)
// remonte. L'ancien code avalait toutes les erreurs et renvoyait "vide" : une
// panne R2 passagere aurait fait ecraser le vrai fichier par un presque-vide.

import { lireJSONDepuisR2 } from "../r2-client.js";

const RACINE = "database/bc";

export const cleBcDocuments = (banque) => `${RACINE}/documents/${banque}.json`;
export const cleBcReference = (banque) => `${RACINE}/reference/${banque}.json`;
export const cleBcState = (banque) => `${RACINE}/state/${banque}.json`;
export const cleBcHistorique = (banque) => `${RACINE}/state-historique/${banque}.json`;

// Anciens chemins du prototype (lecture de repli uniquement)
export const cleAncienneBcDocuments = (banque) => `test/bc-documents/${banque}.json`;
export const cleAncienneBcReference = (banque) => `test/bc-reference/${banque}.json`;
export const cleAncienneBcState = (banque) => `test/bc-state/${banque}.json`;

export function estCleAbsente(err) {
  return (
    err?.name === "NoSuchKey" ||
    err?.Code === "NoSuchKey" ||
    err?.$metadata?.httpStatusCode === 404
  );
}

/**
 * Lit cleNouvelle ; si elle est ABSENTE, lit cleAncienne (si fournie).
 * Toute autre erreur est relancee. Leve NoSuchKey si les deux sont absentes.
 */
export async function lireAvecRepli(cleNouvelle, cleAncienne) {
  try {
    return await lireJSONDepuisR2(cleNouvelle);
  } catch (err) {
    if (!estCleAbsente(err) || !cleAncienne) throw err;
    return await lireJSONDepuisR2(cleAncienne);
  }
}
