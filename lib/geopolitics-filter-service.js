// lib/geopolitics-filter-service.js
//
// Logique portée depuis filters.js (repo BELIEFX-scraping, service Render)
// — même algorithme (normalisation + matching par sous-chaîne), adapté
// ici en français pour TV5MONDE, sans import cross-repo (impossible,
// deux déploiements séparés Render/Vercel).
//
// AUCUN niveau de confiance/importance : un article matché est retenu à
// égalité avec les autres. L'importance relative reste au prompt IA.
//
// AJOUT : regroupement par événement (dedup au-delà de l'URL). Plusieurs
// articles différents (URLs distinctes) peuvent couvrir le même
// événement — ex: 3 pages TV5MONDE sur la même escalade. Sans ce
// regroupement, l'IA recevait 3x le même événement, gaspillant des
// tokens sans apporter d'information nouvelle. Détection par similarité
// de titre (Jaccard sur mots normalisés), pas d'IA/embedding — reste
// mécanique et déterministe, cohérent avec le reste de l'architecture.
//
// Ne touche jamais au scraping TV5MONDE lui-même, ni à l'archive
// Back4App (non filtrée) — s'applique uniquement en aval, juste avant
// l'écriture R2.

const KEYWORDS = require("../config/geopolitics-keywords.json");

const SEUIL_SIMILARITE_EVENEMENT = 0.5; // 50% de mots communs (titre) = même événement

function normaliserTexte(texte = "") {
  return texte
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contientMotCle(texte = "", motsCles = []) {
  const propre = normaliserTexte(texte);
  return motsCles.some((mot) => propre.includes(normaliserTexte(mot)));
}

function detecterCategories(titre = "", description = "") {
  const texte = `${titre} ${description}`;
  const categoriesMatchees = [];

  for (const [cle, def] of Object.entries(KEYWORDS.categories)) {
    if (contientMotCle(texte, def.mots_cles)) {
      categoriesMatchees.push(cle);
    }
  }

  return categoriesMatchees;
}

/**
 * Similarité de Jaccard entre deux titres normalisés : taille de
 * l'intersection des mots / taille de l'union. 1.0 = titres identiques
 * en mots, 0.0 = aucun mot commun.
 */
function calculerSimilariteTitres(titreA, titreB) {
  const motsA = new Set(normaliserTexte(titreA).split(" ").filter((m) => m.length > 2));
  const motsB = new Set(normaliserTexte(titreB).split(" ").filter((m) => m.length > 2));

  if (motsA.size === 0 || motsB.size === 0) return 0;

  const intersection = [...motsA].filter((m) => motsB.has(m));
  const union = new Set([...motsA, ...motsB]);

  return intersection.length / union.size;
}

/**
 * Regroupe les articles couvrant le même événement (titres similaires +
 * au moins une catégorie en commun) en un seul représentant. Le
 * représentant retenu est celui avec la description la plus longue
 * (plus informative), à égalité le plus récent. Les autres sont listés
 * dans `articlesGroupes` pour traçabilité, jamais perdus silencieusement.
 */
function regrouperArticlesParEvenement(articlesAvecCategories) {
  const groupes = [];

  for (const article of articlesAvecCategories) {
    let groupeTrouve = null;

    for (const groupe of groupes) {
      const partageCategorie = article.categories.some((c) => groupe.representant.categories.includes(c));
      if (!partageCategorie) continue;

      const similarite = calculerSimilariteTitres(article.titre, groupe.representant.titre);
      if (similarite >= SEUIL_SIMILARITE_EVENEMENT) {
        groupeTrouve = groupe;
        break;
      }
    }

    if (groupeTrouve) {
      const descriptionPlusLongue = (article.description || "").length > (groupeTrouve.representant.description || "").length;
      const plusRecent = new Date(article.publieLe) > new Date(groupeTrouve.representant.publieLe);

      if (descriptionPlusLongue || plusRecent) {
        groupeTrouve.doublons.push({ titre: groupeTrouve.representant.titre, url: groupeTrouve.representant.url });
        groupeTrouve.representant = article;
      } else {
        groupeTrouve.doublons.push({ titre: article.titre, url: article.url });
      }
    } else {
      groupes.push({ representant: article, doublons: [] });
    }
  }

  return groupes.map((g) => ({
    ...g.representant,
    articlesGroupes: g.doublons,
  }));
}

/**
 * Filtre une liste d'articles bruts (sortie du scraper TV5MONDE) :
 *   1. Ne garde que ceux pertinents au trading (catégorie matchée)
 *   2. Regroupe les doublons d'événement (au-delà du simple dédoublonnage URL)
 *
 * @param {Array<{titre:string, description:string, url:string, publieLe:string, ...}>} articles
 * @returns {Array<object>} articles filtrés et dédoublonnés par événement
 */
function filtrerArticlesPertinentsTrading(articles) {
  const avecCategories = [];

  for (const article of articles) {
    const categories = detecterCategories(article.titre, article.description);
    if (categories.length === 0) continue;

    avecCategories.push({
      ...article,
      categories,
      selectionReason: categories.map((c) => `matched_category_${c}`).join(","),
    });
  }

  return regrouperArticlesParEvenement(avecCategories);
}

module.exports = { detecterCategories, calculerSimilariteTitres, filtrerArticlesPertinentsTrading };
