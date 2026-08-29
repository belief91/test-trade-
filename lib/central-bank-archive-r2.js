// lib/central-bank-archive-r2.js
//
// Écriture partagée de l'archive par devise sur R2
// (database/banque-centrale/{devise}.json). Extrait de la duplication
// entre app/api/pipeline/run/route.js et app/api/cron/central-bank-scrape/
// route.js (29/08) — un seul endroit désormais, utilisé par les deux
// routes ET par la route de migration/rejeu (voir
// app/api/cron/central-bank-migrer-archive/route.js).
//
// Accumulation, jamais d'écrasement : lit l'existant, remplace
// uniquement l'entrée du même (date + categorie) si elle existe déjà,
// ajoute sinon. Idempotent — rejouer la même entrée plusieurs fois ne
// crée pas de doublon.

import { ecrireJSONDansR2, lireJSONDepuisR2 } from "./r2-client";

export async function mettreAJourFichierDevise(devise, entreeDuJour) {
  const cleDevise = `database/banque-centrale/${devise}.json`;

  let historique = [];
  try {
    const existant = await lireJSONDepuisR2(cleDevise);
    historique = existant.historique || [];
  } catch {
    historique = [];
  }

  const dateDuJour = entreeDuJour.date;
  const categorieDuJour = entreeDuJour.categorie;

  const historiqueFiltre = historique.filter(
    (h) => !(h.date === dateDuJour && h.categorie === categorieDuJour)
  );
  historiqueFiltre.push(entreeDuJour);
  historiqueFiltre.sort((a, b) => new Date(a.date) - new Date(b.date));

  await ecrireJSONDansR2(cleDevise, {
    devise,
    updatedAt: new Date().toISOString(),
    count: historiqueFiltre.length,
    historique: historiqueFiltre,
  });

  return cleDevise;
}
