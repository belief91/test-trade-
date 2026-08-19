// lib/central-bank-render-client.js
//
// Centralise l'appel HTTP au service Render pour le scraping banque
// centrale. Avant ce fichier, la même logique était dupliquée dans
// app/api/cron/central-bank-scrape/route.js ET
// app/api/pipeline/run/route.js — un changement de chemin Render
// (comme /scrape/central-bank-statement -> /scrape/central-bank)
// nécessitait de corriger DEUX endroits séparément, et l'un des deux a
// été oublié à chaque fois. Ce fichier élimine ce risque : un seul
// endroit à modifier si Render change à nouveau.

/**
 * Appelle le service Render pour scraper UNE catégorie d'UNE banque
 * centrale. Lève une erreur explicite si la config est manquante ou si
 * l'appel échoue — laisse l'appelant décider comment gérer l'échec
 * (fallback, enregistrement d'erreur, etc.).
 *
 * @param {string} banque - "Fed" | "ECB" | "BoE" | "BoJ" | "SNB" | "BoC" | "RBA" | "RBNZ"
 * @param {string} categorie - "statement" | "minutes" | "presseConference" | "discours" | "monetaryPolicyReport" | "beigeBook"
 * @returns {Promise<string>} le texte brut scrapé
 */
export async function scraperBanqueCentraleViaRender(banque, categorie) {
  const renderUrl = process.env.RENDER_SCRAPER_URL;
  const renderSecret = process.env.RENDER_SCRAPER_SECRET;

  if (!renderUrl || !renderSecret) {
    throw new Error("RENDER_SCRAPER_URL ou RENDER_SCRAPER_SECRET manquant");
  }

  const renderResponse = await fetch(`${renderUrl}/scrape/central-bank`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${renderSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ banque, categorie }),
  });

  if (!renderResponse.ok) {
    throw new Error(`Échec appel Render : HTTP ${renderResponse.status}`);
  }

  const { success, texte, error: renderError } = await renderResponse.json();

  if (!success) {
    throw new Error(renderError || "Le service Render a renvoyé une erreur");
  }

  return texte;
}
