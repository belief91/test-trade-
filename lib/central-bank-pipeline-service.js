// lib/central-bank-pipeline-service.js
import Parse from "./back4app-server";

const CLASS_NAME = "CentralBankPipeline";
const MAX_TENTATIVES = 3;
const FENETRE_RATTRAPAGE_JOURS = 4;

/**
 * FIX COHÉRENCE (29/08) : ce seuil n'existait qu'en dur dans la route de
 * migration (app/api/cron/central-bank-migrer-archive/route.js), après
 * avoir découvert qu'une entrée avec une seule phrase (la mention
 * légale de fin de document FOMC minutes, pas le contenu réel) avait
 * été marquée "done" et migrée vers R2. Le chemin AUTOMATIQUE (le cron
 * du soir et le bouton "Recharger") n'avait aucun filtre équivalent —
 * un futur scraping automatique renvoyant un résultat aussi pauvre
 * aurait été écrit tel quel dans R2, sans que personne ne le sache.
 * Centralisé ici et utilisé partout : central-bank-scrape/route.js,
 * pipeline/run/route.js, et la route de migration.
 */
export const SEUIL_MIN_PHRASES = 3;

export function contenuEstSuffisant(documentFinal) {
  return Array.isArray(documentFinal) && documentFinal.length >= SEUIL_MIN_PHRASES;
}

function dateAujourdhuiMadagascar() {
  const maintenant = new Date();
  const options = { timeZone: "Indian/Antananarivo" };
  const weekday = maintenant.toLocaleDateString("en-US", { ...options, weekday: "long" });
  const month = maintenant.toLocaleDateString("en-US", { ...options, month: "long" });
  const day = parseInt(
    maintenant.toLocaleDateString("en-US", { ...options, day: "numeric" }),
    10
  );
  const year = maintenant.toLocaleDateString("en-US", { ...options, year: "numeric" });
  return `${weekday} ${month} ${day} ${year}`;
}

/**
 * ÉTAPE MATIN (ou bouton manuel) — enregistre le résultat de la
 * reconnaissance pour UN événement bancaire précis.
 */
export async function enregistrerReconnaissance({
  devise,
  banqueCentrale,
  categorie,
  evenementNom,
  heureEvenement,
  scrapeTarget,
}) {
  const Pipeline = Parse.Object.extend(CLASS_NAME);
  const dateDuJour = dateAujourdhuiMadagascar();

  const query = new Parse.Query(Pipeline);
  query.equalTo("dateTexte", dateDuJour);
  if (devise) {
    query.equalTo("deviseDetectee", devise);
  } else {
    query.doesNotExist("deviseDetectee");
  }
  if (categorie) {
    query.equalTo("categorie", categorie);
  } else {
    query.doesNotExist("categorie");
  }
  let entry = await query.first({ useMasterKey: true });

  if (!entry) {
    entry = new Pipeline();
  }

  entry.set("date", new Date());
  entry.set("dateTexte", dateDuJour);
  entry.set("deviseDetectee", devise || null);
  entry.set("banqueCentrale", banqueCentrale || null);
  entry.set("categorie", categorie || null);
  entry.set("evenementNom", evenementNom || null);
  entry.set("heureEvenement", heureEvenement || null);
  entry.set("scrapeTarget", !!scrapeTarget);
  entry.set("statutScraping", scrapeTarget ? "pending" : "skipped");
  if (!entry.get("documentFinal")) {
    entry.set("documentFinal", []);
  }
  if (entry.get("tentatives") === undefined) {
    entry.set("tentatives", 0);
  }

  const saved = await entry.save(null, { useMasterKey: true });
  return saved;
}

/**
 * ÉTAPE SOIR — récupère les entrées "pending" à traiter (fenêtre de
 * rattrapage 4 jours + tolérance aux entrées sans champ "tentatives").
 */
export async function lireReconnaissancesDuJour() {
  const Pipeline = Parse.Object.extend(CLASS_NAME);
  const bornDate = new Date(Date.now() - FENETRE_RATTRAPAGE_JOURS * 24 * 60 * 60 * 1000);

  const requeteAvecTentatives = new Parse.Query(Pipeline);
  requeteAvecTentatives.equalTo("statutScraping", "pending");
  requeteAvecTentatives.greaterThanOrEqualTo("date", bornDate);
  requeteAvecTentatives.lessThan("tentatives", MAX_TENTATIVES);

  const requeteSansTentatives = new Parse.Query(Pipeline);
  requeteSansTentatives.equalTo("statutScraping", "pending");
  requeteSansTentatives.greaterThanOrEqualTo("date", bornDate);
  requeteSansTentatives.doesNotExist("tentatives");

  const query = Parse.Query.or(requeteAvecTentatives, requeteSansTentatives);
  query.limit(1000);

  const resultats = await query.find({ useMasterKey: true });
  return resultats;
}

/**
 * APRÈS SCRAPING + FILTRAGE — met à jour l'entrée avec le document
 * final.
 *
 * FIX COHÉRENCE (29/08) : "done" exige désormais contenuEstSuffisant()
 * (au moins SEUIL_MIN_PHRASES), pas juste "au moins 1 phrase". Un
 * résultat pauvre (ex: mention légale seule) est traité comme "skipped",
 * pas comme un succès — cohérent avec ce que vérifie la route de
 * migration, pour que le chemin automatique n'écrive plus jamais un
 * contenu insuffisant dans database/banque-centrale/{devise}.json.
 */
export async function enregistrerDocumentFinal(objectId, paragraphes) {
  const Pipeline = Parse.Object.extend(CLASS_NAME);
  const query = new Parse.Query(Pipeline);

  const entry = await query.get(objectId, { useMasterKey: true });

  const statut = contenuEstSuffisant(paragraphes) ? "done" : "skipped";
  entry.set("documentFinal", paragraphes || []);
  entry.set("statutScraping", statut);

  const saved = await entry.save(null, { useMasterKey: true });
  return saved;
}

/**
 * APRÈS ÉCHEC DE SCRAPING — trace l'échec au lieu de laisser l'entrée
 * silencieusement bloquée à "pending" pour toujours.
 */
export async function enregistrerEchecScraping(objectId, messageErreur) {
  const Pipeline = Parse.Object.extend(CLASS_NAME);
  const query = new Parse.Query(Pipeline);

  const entry = await query.get(objectId, { useMasterKey: true });

  const tentativesPrecedentes = entry.get("tentatives") || 0;
  const tentatives = tentativesPrecedentes + 1;

  entry.set("tentatives", tentatives);
  entry.set("derniereErreur", messageErreur || null);
  entry.set("derniereTentative", new Date());
  entry.set("statutScraping", tentatives >= MAX_TENTATIVES ? "error_definitif" : "pending");

  const saved = await entry.save(null, { useMasterKey: true });
  return saved;
}

/**
 * MIGRATION / REJEU — récupère TOUTES les entrées "done", peu importe
 * leur âge, pour reconstruire l'archive R2 par devise à la demande.
 * Voir app/api/cron/central-bank-migrer-archive/route.js.
 */
export async function recupererTousLesEvenementsDone() {
  const Pipeline = Parse.Object.extend(CLASS_NAME);
  const query = new Parse.Query(Pipeline);

  query.equalTo("statutScraping", "done");
  query.limit(1000);

  const resultats = await query.find({ useMasterKey: true });
  return resultats;
}

/**
 * FALLBACK — récupère le dernier événement bancaire connu avec un
 * document valide, pour une devise ET une catégorie données.
 */
export async function recupererDernierEventConnu(devise, categorie) {
  const Pipeline = Parse.Object.extend(CLASS_NAME);
  const query = new Parse.Query(Pipeline);

  query.equalTo("statutScraping", "done");
  if (devise) {
    query.equalTo("deviseDetectee", devise);
  }
  if (categorie) {
    query.equalTo("categorie", categorie);
  }
  query.descending("date");

  const result = await query.first({ useMasterKey: true });
  if (!result) return null;

  return {
    documentFinal: result.get("documentFinal") || [],
    estDonneeSecours: true,
    dateOriginale: result.get("dateTexte") || null,
    evenementOriginal: result.get("evenementNom") || null,
    categorieOriginale: result.get("categorie") || null,
  };
}
