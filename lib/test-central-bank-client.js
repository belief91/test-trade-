// lib/test-central-bank-client.js
//
// Client isolé pour la route de test Render /scrape/test-central-bank.
// Séparé de lib/central-bank-render-client.js (production) — même
// serveur Render, même secret, mais route et contrat différents
// (pas de paramètre "banque", retourne {texte, pubDate, source} au
// lieu de {texte} seul).

export async function scraperTestFedViaRender(categorie) {
  const renderUrl = process.env.RENDER_SCRAPER_URL;
  const renderSecret = process.env.RENDER_SCRAPER_SECRET;

  if (!renderUrl || !renderSecret) {
    throw new Error("RENDER_SCRAPER_URL ou RENDER_SCRAPER_SECRET manquant");
  }

  const renderResponse = await fetch(`${renderUrl}/scrape/test-central-bank`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${renderSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ categorie }),
  });

  if (!renderResponse.ok) {
    throw new Error(`Échec appel Render (test) : HTTP ${renderResponse.status}`);
  }

  const { success, texte, pubDate, source, error: renderError } = await renderResponse.json();

  if (!success) {
    throw new Error(renderError || "Le service Render (test) a renvoyé une erreur");
  }

  return { texte, pubDate, source };
}
