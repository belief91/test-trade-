// lib/journal-reset-service.js
//
// Reset mensuel du Journal, conditionné par le module Screenshot :
// - Un trade N'EST réinitialisé (archivé sur R2 puis supprimé de Back4App)
//   QUE si une ScreenshotEntry le pointe via linkedTradeId ET que son
//   champ "apresUrl" est rempli.
// - Un trade dont le screenshot lié n'a pas encore de "après" reste
//   intact — il sera réévalué au reset du mois suivant.
// - Un trade sans AUCUNE ScreenshotEntry liée reste intact indéfiniment
//   (décision explicite — voir échange avec l'utilisateur du 06/09/2026).
// Le Dashboard n'a besoin d'aucun traitement séparé : il recalcule tout
// en direct depuis les trades restants (voir app/dashboard/page.js).

import Parse from "./back4app-server";
import { archiverTradeDuMois } from "./journal-archive-r2";

const FUSEAU = "Indian/Antananarivo";

function partieDate(date, options) {
  return date.toLocaleDateString("en-US", { timeZone: FUSEAU, ...options });
}

/** Clé "AAAA-MM" du mois en cours, en heure de Madagascar. */
export function cleMoisCourant(maintenant = new Date()) {
  const year = partieDate(maintenant, { year: "numeric" });
  const month = partieDate(maintenant, { month: "2-digit" });
  return `${year}-${month}`;
}

/**
 * Vrai si "aujourd'hui" (heure Madagascar) est le dernier jour du mois.
 * GitHub Actions ne sait pas planifier "le dernier jour du mois" — la
 * route est donc appelée chaque jour et se désactive elle-même tant
 * que ce n'est pas le cas.
 */
export function estDernierJourDuMois(maintenant = new Date()) {
  const jour = parseInt(partieDate(maintenant, { day: "numeric" }), 10);
  const mois = parseInt(partieDate(maintenant, { month: "numeric" }), 10);
  const annee = parseInt(partieDate(maintenant, { year: "numeric" }), 10);
  const dernierJourDuMois = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  return jour === dernierJourDuMois;
}

/**
 * Récupère l'ensemble des tradeId éligibles au reset : liés à une
 * ScreenshotEntry dont le "après" est rempli.
 *
 * .exists() seul ne suffit pas ici : à la création, avantUrl/apresUrl/
 * linkedTradeId sont explicitement mis à `null` (voir
 * lib/screenshotEntries.js), donc le champ "existe" même vide. On
 * ajoute notEqualTo(null) pour ne retenir que les valeurs réellement
 * renseignées.
 */
async function trouverTradeIdsEligibles() {
  const ScreenshotEntry = Parse.Object.extend("ScreenshotEntry");
  const query = new Parse.Query(ScreenshotEntry);
  query.exists("apresUrl");
  query.notEqualTo("apresUrl", null);
  query.exists("linkedTradeId");
  query.notEqualTo("linkedTradeId", null);
  query.limit(1000);

  const entries = await query.find({ useMasterKey: true });

  const tradeIds = new Set();
  entries.forEach((entry) => {
    const id = entry.get("linkedTradeId");
    if (id) tradeIds.add(id);
  });
  return [...tradeIds];
}

/**
 * Exécute le reset mensuel : archive puis supprime chaque trade
 * éligible. Chaque trade est traité indépendamment (une erreur sur un
 * trade n'empêche pas le traitement des autres).
 */
export async function reinitialiserJournalMensuel() {
  const Trade = Parse.Object.extend("Trade");
  const cleMois = cleMoisCourant();

  const tradeIds = await trouverTradeIdsEligibles();

  const resultat = {
    mois: cleMois,
    eligibles: tradeIds.length,
    archives: 0,
    erreurs: [],
  };

  for (const tradeId of tradeIds) {
    try {
      const query = new Parse.Query(Trade);
      const trade = await query.get(tradeId, { useMasterKey: true });

      const tradeArchive = { ...trade.toJSON(), id: trade.id };
      await archiverTradeDuMois(cleMois, tradeArchive);
      await trade.destroy({ useMasterKey: true });

      resultat.archives += 1;
    } catch (err) {
      resultat.erreurs.push({ tradeId, message: err.message });
    }
  }

  return resultat;
}
