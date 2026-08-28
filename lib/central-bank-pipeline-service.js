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
 * FIX CRITIQUE #1 (27/08) : filtrait auparavant sur dateTexte ===
 * aujourd'hui uniquement. Quand un scraping échoue,
 * enregistrerDocumentFinal() n'était jamais appelé sur l'entrée en
 * échec — elle restait "pending" avec la dateTexte du jour de sa
 * détection. Le lendemain, cette requête ne cherchait QUE la dateTexte
 * d'aujourd'hui : l'entrée en échec devenait orpheline pour toujours.
 * Corrigé une première fois avec une fenêtre glissante de
 * FENETRE_RATTRAPAGE_JOURS jours (sur le champ Date `date`, pas le
 * texte) + exclusion des entrées ayant atteint MAX_TENTATIVES échecs.
 *
 * FIX CRITIQUE #2 (28/08) : le fix #1 n'a PAS suffi en production —
 * confirmé, aucune donnée banque centrale n'est apparue sur R2 après le
 * cron du 27/08 au soir. Cause : query.lessThan("tentatives",
 * MAX_TENTATIVES) ne matche JAMAIS un objet Parse/Mongo où le champ
 * "tentatives" n'existe pas du tout sur l'objet — ce n'est pas traité
 * comme "0 < 3", l'objet est exclu silencieusement de la requête. Toute
 * entrée créée AVANT l'introduction de ce champ (dont AUD/RBA du 25/08)
 * n'a jamais eu "tentatives" défini, donc reste invisible à cette
 * requête même après l'élargissement de la fenêtre à 4 jours.
 *
 * Conséquence observée : lireReconnaissancesDuJour() a renvoyé 0
 * résultat, et la route appelante (central-bank-scrape/route.js)
 * s'arrête sur `if (entrees.length === 0) return {status:"skip"}` SANS
 * JAMAIS toucher R2 — silence total, aucun fichier écrit, pas même
 * vide. C'est ce silence total qui a été observé, pas seulement AUD
 * manquant : toute entrée pending sans champ tentatives (donc toutes
 * les entrées antérieures au 27/08) était invisible.
 *
 * Corrigé avec Parse.Query.or() : matche les entrées avec
 * tentatives < MAX_TENTATIVES OU sans champ tentatives du tout (absence
 * de champ traitée comme équivalente à 0, donc éligible au retry).
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
 * silencieusement bloquée à "pending" pour toujours.
 *
 * Reste "pending" tant que tentatives < MAX_TENTATIVES, pour être
 * retenté aux prochains crons (dans la fenêtre de rattrapage) — passe
 * à "error_definitif" une fois la limite atteinte.
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
