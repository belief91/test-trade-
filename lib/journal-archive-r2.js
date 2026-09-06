// lib/journal-archive-r2.js
//
// Archive les trades du Journal supprimés lors du reset mensuel
// (database/journal-archive/{AAAA-MM}.json). Même logique
// accumulative que lib/central-bank-archive-r2.js : lit l'existant,
// ajoute les nouvelles entrées, jamais d'écrasement. Idempotent —
// rejouer le reset avec le même trade (même id) ne crée pas de doublon.

import { ecrireJSONDansR2, lireJSONDepuisR2 } from "./r2-client";

function cleArchiveMois(cleMois) {
  return `database/journal-archive/${cleMois}.json`;
}

/**
 * Ajoute un trade archivé au fichier du mois courant. `cleMois` au
 * format "AAAA-MM" (voir journal-reset-service.js). `tradeArchive` doit
 * déjà contenir toutes les infos utiles (id, date, paire, result, etc.)
 * ainsi que le motif d'archivage.
 */
export async function archiverTradeDuMois(cleMois, tradeArchive) {
  const cle = cleArchiveMois(cleMois);

  let historique = [];
  try {
    const existant = await lireJSONDepuisR2(cle);
    historique = existant.historique || [];
  } catch {
    historique = [];
  }

  const dejaPresent = historique.some((h) => h.id === tradeArchive.id);
  if (!dejaPresent) {
    historique.push(tradeArchive);
  }

  await ecrireJSONDansR2(cle, {
    mois: cleMois,
    updatedAt: new Date().toISOString(),
    count: historique.length,
    historique,
  });

  return cle;
}
