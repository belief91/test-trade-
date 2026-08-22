// lib/calendrier-archive-r2.js
//
// Source de vérité UNIQUE pour l'historique du calendrier économique.
// Remplace la dépendance à Back4App CentralBankCalendar comme entrepôt
// historique croissant — après 4 mois d'exécution, cette table
// deviendrait ingérable. R2 devient la seule référence : un fichier,
// mis à jour par fusion/dédoublonnage, jamais recréé de zéro.
//
// Utilisé à la fois par le scraper hebdomadaire (central-bank-calendar/
// route.js) ET par le script de migration ponctuelle — logique de fusion
// centralisée ici pour ne jamais diverger entre les deux appelants.

import { lireJSONDepuisR2, ecrireJSONDansR2 } from "./r2-client.js";

export const CLE_ARCHIVE_CALENDRIER = "database/calendrier-bc/archive-consolide.json";

/**
 * Lit l'archive complète actuelle sur R2. Retourne un tableau vide si le
 * fichier n'existe pas encore (première exécution).
 */
export async function lireArchiveCalendrier() {
  try {
    const contenu = await lireJSONDepuisR2(CLE_ARCHIVE_CALENDRIER);
    return contenu.data || [];
  } catch {
    return [];
  }
}

/**
 * Fusionne de nouveaux événements dans l'archive existante, avec
 * dédoublonnage sur (devise+evenement+date). Un événement déjà présent
 * est remplacé par la nouvelle version (ex: "reel" qui passe de vide à
 * une valeur publiée), jamais dupliqué. Écrit le résultat fusionné sur
 * R2 en un seul fichier.
 *
 * @param {Array<object>} nouveauxEvenements - événements à intégrer (même format que scraperCalendrierBC())
 * @returns {Promise<{count: number}>}
 */
export async function fusionnerDansArchiveCalendrier(nouveauxEvenements) {
  const archiveExistante = await lireArchiveCalendrier();

  const parCle = new Map();
  for (const e of archiveExistante) {
    parCle.set(`${e.devise}|${e.evenement}|${e.date}`, e);
  }
  for (const e of nouveauxEvenements) {
    parCle.set(`${e.devise}|${e.evenement}|${e.date}`, e);
  }

  const fusionnes = Array.from(parCle.values()).sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  await ecrireJSONDansR2(CLE_ARCHIVE_CALENDRIER, {
    updatedAt: new Date().toISOString(),
    count: fusionnes.length,
    data: fusionnes,
  });

  return { count: fusionnes.length };
}
