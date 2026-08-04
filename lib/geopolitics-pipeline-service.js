// lib/geopolitics-pipeline-service.js
//
// Gère le stockage Back4App des articles géopolitiques scrapés (TV5MONDE).
// Classe Back4App : GeopoliticalNews
// Dédoublonnage : sur le champ `url` (identifiant naturel d'un article).

import Parse from "./back4app-server";

const NOM_CLASSE = "GeopoliticalNews";

/**
 * Upsert des articles scrapés. Un article déjà présent (même `url`) est
 * ignoré — pas de mise à jour, on considère le premier scrape comme
 * définitif pour cet article.
 *
 * @param {Array<{titre:string, source:string, url:string, publieLe:string|null, description:string, categorie?:string}>} articles
 * @returns {Promise<number>} nombre de nouveaux articles réellement insérés
 */
export async function upsertArticlesGeopolitiques(articles) {
  let nouveaux = 0;

  for (const article of articles) {
    if (!article.url || !article.titre) continue;

    const requeteExistant = new Parse.Query(NOM_CLASSE);
    requeteExistant.equalTo("url", article.url);
    const existant = await requeteExistant.first({ useMasterKey: true });

    if (existant) continue; // déjà en base : dédoublonnage

    const GeopoliticalNews = Parse.Object.extend(NOM_CLASSE);
    const objet = new GeopoliticalNews();

    objet.set("titre", article.titre);
    objet.set("source", article.source || "TV5MONDE");
    objet.set("url", article.url);
    objet.set("publieLe", article.publieLe ? new Date(article.publieLe) : new Date());
    objet.set("description", article.description || "");
    objet.set("categorie", article.categorie || null);

    await objet.save(null, { useMasterKey: true });
    nouveaux++;
  }

  return nouveaux;
}

/**
 * Récupère la fenêtre glissante des articles publiés dans les dernières 24h,
 * triés du plus récent au plus ancien.
 *
 * @returns {Promise<Array<object>>}
 */
export async function recupererArticlesDernieres24h() {
  const il24hEnArriere = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const requete = new Parse.Query(NOM_CLASSE);
  requete.greaterThanOrEqualTo("publieLe", il24hEnArriere);
  requete.descending("publieLe");
  requete.limit(1000);

  const resultats = await requete.find({ useMasterKey: true });

  return resultats.map((obj) => ({
    titre: obj.get("titre"),
    source: obj.get("source"),
    url: obj.get("url"),
    publieLe: obj.get("publieLe"),
    description: obj.get("description"),
    categorie: obj.get("categorie"),
  }));
}
