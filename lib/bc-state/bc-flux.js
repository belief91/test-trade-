// lib/bc-state/bc-flux.js
//
// Flux continu d'une banque centrale : scrape les 6 categories, filtre,
// puis ingere DIRECTEMENT dans bc_documents (deduplication par hash).
//
// Pas de fichier brut qui grossit : le flux de test Fed reecrit un
// fichier de ~770 entrees (96 % de doublons) a chaque categorie, ce qui
// ne tiendrait pas a 8 banques. Ici la deduplication se fait a
// l'ecriture : seuls les documents nouveaux sont conserves.
//
// Logique pure (dependances injectees) : testable sans reseau ni R2,
// partagee par toutes les banques. La route app/api/cron/bc-flux ne fait
// que fournir les vraies dependances.
//
// Une categorie en echec (source indisponible, "non applicable", flux RSS
// sans l'item cherche...) n'interrompt pas les autres : elle est
// enregistree avec status "error" et ignoree par l'ingestion.

export const CATEGORIES_BC = [
  "statement",
  "minutes",
  "presseConference",
  "discours",
  "monetaryPolicyReport",
  "beigeBook",
];

/**
 * @param {string} banque
 * @param {object} deps
 * @param {(banque: string, categorie: string) => Promise<{texte: string, pubDate: string|null, source: string|null}>} deps.scraper
 * @param {(texte: string, banque: string) => string[]} deps.filtrer
 * @param {(banque: string, entrees: object[]) => Promise<object>} deps.ingerer
 * @param {string[]} [deps.categories]
 * @param {() => string} [deps.maintenant]
 */
export async function executerFlux(banque, deps) {
  const {
    scraper,
    filtrer,
    ingerer,
    categories = CATEGORIES_BC,
    maintenant = () => new Date().toISOString(),
  } = deps;

  const horodatageRun = maintenant();
  const entrees = [];

  for (const categorie of categories) {
    try {
      const { texte, pubDate, source } = await scraper(banque, categorie);
      const phrases = filtrer(texte, banque);
      entrees.push({
        horodatageRun,
        categorie,
        status: phrases.length > 0 ? "ok" : "vide_apres_filtre",
        documentFinal: phrases,
        pubDate: pubDate || null,
        source: source || null,
      });
    } catch (error) {
      entrees.push({
        horodatageRun,
        categorie,
        status: "error",
        documentFinal: [],
        pubDate: null,
        source: null,
        messageErreur: error.message,
      });
    }
  }

  const ingestion = await ingerer(banque, entrees);
  return { horodatageRun, entrees, ingestion };
}
