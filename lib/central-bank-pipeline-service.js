// lib/central-bank-pipeline-service.js
import Parse from "./back4app-server";

const CLASS_NAME = "CentralBankPipeline";
const MAX_TENTATIVES = 3;
const FENETRE_RATTRAPAGE_JOURS = 4;

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
 * Clé de déduplication : dateTexte + devise + categorie — permet
 * plusieurs entrées le même jour (ex: EUR/statement ET EUR/presseConference
 * si l'ECB publie les deux le même jour), sans jamais créer de doublon
 * pour la même combinaison.
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
 * ÉTAPE SOIR — récupère les entrées "pending" à traiter.
 *
 * FIX CRITIQUE (27/08) : filtrait auparavant sur dateTexte === aujourd'hui
 * uniquement. Conséquence découverte en production : quand un scraping
 * échoue (ex: bug de chemin Render du 19-26/08, qui a cassé TOUTES les
 * devises pendant ~1 semaine), enregistrerDocumentFinal() n'était jamais
 * appelé sur l'entrée en échec — elle restait "pending" avec la dateTexte
 * du jour où elle a été détectée. Le lendemain, cette requête ne cherche
 * QUE la dateTexte d'aujourd'hui : l'entrée en échec de la veille devient
 * orpheline pour toujours, plus aucun cron futur ne la relit. Confirmé
 * sur l'entrée AUD/RBA minutes du 25/08, jamais rattrapée.
 *
 * Corrigé : la requête regarde maintenant une fenêtre glissante de
 * FENETRE_RATTRAPAGE_JOURS jours en arrière (sur le champ Date `date`,
 * pas le texte), et exclut les entrées qui ont déjà atteint
 * MAX_TENTATIVES échecs consécutifs (pour ne pas re-tenter indéfiniment
 * un cas structurellement cassé, ex: une devise mal détectée).
 */
export async function lireReconnaissancesDuJour() {
  const Pipeline = Parse.Object.extend(CLASS_NAME);
  const query = new Parse.Query(Pipeline);

  const bornDate = new Date(Date.now() - FENETRE_RATTRAPAGE_JOURS * 24 * 60 * 60 * 1000);

  query.equalTo("statutScraping", "pending");
  query.greaterThanOrEqualTo("date", bornDate);
  query.lessThan("tentatives", MAX_TENTATIVES);
  query.limit(1000);

  const resultats = await query.find({ useMasterKey: true });
  return resultats;
}

/**
 * APRÈS SCRAPING + FILTRAGE (succès) — met à jour l'entrée avec le
 * document final.
 */
export async function enregistrerDocumentFinal(objectId, paragraphes) {
  const Pipeline = Parse.Object.extend(CLASS_NAME);
  const query = new Parse.Query(Pipeline);

  const entry = await query.get(objectId, { useMasterKey: true });

  const statut = paragraphes && paragraphes.length > 0 ? "done" : "skipped";
  entry.set("documentFinal", paragraphes || []);
  entry.set("statutScraping", statut);

  const saved = await entry.save(null, { useMasterKey: true });
  return saved;
}

/**
 * APRÈS ÉCHEC DE SCRAPING — trace l'échec au lieu de laisser l'entrée
 * silencieusement bloquée à "pending" pour toujours (c'était le vrai
 * bug : aucune fonction n'était jamais appelée dans le catch de
 * app/api/cron/central-bank-scrape/route.js).
 *
 * Reste "pending" tant que tentatives < MAX_TENTATIVES, pour être
 * retenté aux prochains crons (dans la fenêtre de rattrapage) — passe
 * à "error_definitif" une fois la limite atteinte, pour arrêter les
 * tentatives sur un cas structurellement cassé plutôt que de le
 * retenter indéfiniment.
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
 * FALLBACK — récupère le dernier événement bancaire connu avec un
 * document valide, pour une devise donnée.
 */
export async function recupererDernierEventConnu(devise) {
  const Pipeline = Parse.Object.extend(CLASS_NAME);
  const query = new Parse.Query(Pipeline);

  query.equalTo("statutScraping", "done");
  if (devise) {
    query.equalTo("deviseDetectee", devise);
  }
  query.descending("date");

  const result = await query.first({ useMasterKey: true });
  return result;
}
