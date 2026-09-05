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
//
// FIX CRITIQUE #4 (05/09) : ajout du suivi "déjà traités". Depuis fin
// août, la liste des "publications du jour" (calendrier-consolide.json)
// tentait de deviner "quel jour sommes-nous" à partir de l'horloge —
// fragile face aux retards récurrents de GitHub Actions (confirmé 3
// fois en une semaine : cron exécuté après minuit GMT+3 le 27/08, avec
// 2h52 de retard le 03/09, encore après minuit le 04/09). Chaque
// correctif successif sur la logique de date n'a fait que déplacer le
// problème.
//
// Nouvelle approche : au lieu de deviner la date, on se souvient de
// quels événements (devise+evenement+date) ont déjà été inclus dans une
// "publication du jour" précédente. Un événement n'est retenu qu'une
// seule fois, la première fois qu'il a une valeur publiée — peu importe
// à quelle heure ou quel jour calendaire le script tourne. Élimine
// totalement la dépendance à l'horloge pour cette décision.

import { lireJSONDepuisR2, ecrireJSONDansR2 } from "./r2-client.js";

export const CLE_ARCHIVE_CALENDRIER = "database/calendrier-bc/archive-consolide.json";
export const CLE_EVENEMENTS_DEJA_TRAITES = "database/calendrier-bc/deja-traites.json";
const JOURS_RETENTION_DEJA_TRAITES = 60; // aligné sur la plus grande fenetre_historique_jours utilisée ailleurs

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

export function cleEvenement(e) {
  return `${e.devise}|${e.evenement}|${e.date}`;
}

/**
 * FIX CRITIQUE #4 (05/09) — lit l'ensemble des clés d'événements déjà
 * traités (déjà inclus dans une "publication du jour" lors d'un run
 * précédent, peu importe quel jour calendaire). Retourne un Set vide si
 * le fichier n'existe pas encore.
 */
export async function lireEvenementsDejaTraites() {
  try {
    const contenu = await lireJSONDepuisR2(CLE_EVENEMENTS_DEJA_TRAITES);
    return new Set(contenu.cles || []);
  } catch {
    return new Set();
  }
}

/**
 * FIX CRITIQUE #4 (05/09) — ajoute de nouvelles clés d'événements à la
 * liste des déjà-traités, et purge celles plus vieilles que
 * JOURS_RETENTION_DEJA_TRAITES pour ne pas grossir indéfiniment.
 * La purge se fait sur la date encodée dans chaque clé (3e segment
 * après split sur "|").
 */
export async function enregistrerEvenementsTraites(nouvellesCles) {
  if (nouvellesCles.length === 0) return;

  let existantes = [];
  try {
    const contenu = await lireJSONDepuisR2(CLE_EVENEMENTS_DEJA_TRAITES);
    existantes = contenu.cles || [];
  } catch {
    existantes = [];
  }

  const toutes = new Set([...existantes, ...nouvellesCles]);

  const bornDate = new Date(Date.now() - JOURS_RETENTION_DEJA_TRAITES * 24 * 60 * 60 * 1000);
  const purgees = [...toutes].filter((cle) => {
    const parties = cle.split("|");
    const dateStr = parties[parties.length - 1];
    const d = new Date(dateStr);
    return isNaN(d.getTime()) || d >= bornDate; // garde si date illisible, par prudence
  });

  await ecrireJSONDansR2(CLE_EVENEMENTS_DEJA_TRAITES, {
    updatedAt: new Date().toISOString(),
    count: purgees.length,
    cles: purgees,
  });
}
