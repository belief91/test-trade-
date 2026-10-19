// lib/central-bank-meta-client.js
//
// Client Render pour le flux continu : meme contrat que
// lib/central-bank-render-client.js, mais appelle /scrape/central-bank-meta
// et retourne { texte, pubDate, source } au lieu du texte seul.
// pubDate = date de publication reelle du document (RSS) ou null ;
// source = URL du document scrape.
//
// Banques disponibles : celles de SCRAPERS_META_PAR_BANQUE cote Render
// (index.js). Une banque absente renvoie HTTP 400 avec la liste des
// banques disponibles - l'erreur est remontee telle quelle.

export async function scraperBanqueCentraleAvecMetaViaRender(banque, categorie) {
  const renderUrl = process.env.RENDER_SCRAPER_URL;
  const renderSecret = process.env.RENDER_SCRAPER_SECRET;

  if (!renderUrl || !renderSecret) {
    throw new Error("RENDER_SCRAPER_URL ou RENDER_SCRAPER_SECRET manquant");
  }

  const renderResponse = await fetch(`${renderUrl}/scrape/central-bank-meta`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${renderSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ banque, categorie }),
  });

  if (!renderResponse.ok) {
    // Le corps de la reponse contient la vraie cause : on le remonte
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
      `Échec appel Render (meta) : HTTP ${renderResponse.status}${detailErreur ? ` — ${detailErreur}` : " (aucun détail dans la réponse)"}`
    );
  }

  const { success, texte, pubDate, source, error } = await renderResponse.json();

  if (!success) {
    throw new Error(error || "Le service Render a renvoyé une erreur");
  }

  return { texte, pubDate: pubDate || null, source: source || null };
}
