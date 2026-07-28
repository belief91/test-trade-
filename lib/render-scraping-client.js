// lib/render-scraping-client.js
// Centralise tous les appels vers le Render Web Service (repo E:\scraping)

const RENDER_BASE_URL = process.env.RENDER_SCRAPING_URL;

function assertConfig() {
  if (!RENDER_BASE_URL) {
    throw new Error("RENDER_SCRAPING_URL manquant dans les variables d'environnement");
  }
}

/**
 * Récupère le calendrier économique du jour depuis Render (TradingEconomics).
 * Réponse attendue : [{ heure, evenement, devise }, ...]
 */
export async function fetchCalendrierDuJour() {
  assertConfig();
  const res = await fetch(`${RENDER_BASE_URL}/calendar/today`);
  if (!res.ok) throw new Error(`Erreur calendrier Render : ${res.status}`);
  return await res.json();
}

/**
 * Déclenche le scraping ciblé d'une seule banque centrale.
 * Bloque toutes les autres BC — Render ne scrape QUE celle demandée.
 * Réponse attendue : { texte: "..." } (texte brut de la page de la BC)
 */
export async function scraperBanqueCentrale(banqueCentrale) {
  assertConfig();
  const res = await fetch(`${RENDER_BASE_URL}/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ banque: banqueCentrale }),
  });
  if (!res.ok) throw new Error(`Erreur scraping Render (${banqueCentrale}) : ${res.status}`);
  return await res.json();
}
