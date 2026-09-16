// lib/central-bank-render-client.js
//
// FIX : le code precedent jetait une erreur generique "HTTP 500" sans
// jamais lire le corps de la reponse Render, qui contient pourtant le
// vrai message d'erreur. Resultat observe en production le 16 sept :
// deux categories USD (statement + presseConference) ont echoue avec le
// meme message inutile "Echec appel Render : HTTP 500", impossible de
// savoir si c'etait le meme probleme deja corrige ou un nouveau.
//
// Desormais, le corps de la reponse est lu meme en cas d'echec HTTP, et
// son contenu est inclus dans le message d'erreur remonte au dashboard.

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
    let detailErreur = "";
    try {
      const corpsErreur = await renderResponse.json();
      detailErreur = corpsErreur.error || JSON.stringify(corpsErreur);
    } catch {
      try {
        detailErreur = await renderResponse.text();
      } catch {
        detailErreur = "";
      }
    }
    throw new Error(
      `Échec appel Render : HTTP ${renderResponse.status}${detailErreur ? ` — ${detailErreur}` : " (aucun détail dans la réponse)"}`
    );
  }

  const { success, texte, error: renderError } = await renderResponse.json();

  if (!success) {
    throw new Error(renderError || "Le service Render a renvoyé une erreur");
  }

  return texte;
}
