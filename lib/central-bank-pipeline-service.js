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
 * rattrapage 4 jours + tolérance aux entrées sans champ "tentatives",
 * voir historique de conversation pour le détail des 2 bugs corrigés
 * les 27 et 28/08).
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
 * MIGRATION / REJEU — récupère TOUTES les entrées "done" (succès de
 * scraping), peu importe leur âge, pour reconstruire l'archive R2 par
 * devise à la demande.
 *
 * Pourquoi cette fonction existe (29/08) : le pipeline ne peut être
 * validé qu'en attendant un vrai événement bancaire, rare et
 * imprévisible (une banque G10 ne publie que 8-11 fois par an). Quand
 * un vrai événement survient et qu'un bug empêche l'archivage (ex: AUD
 * le 25/08, USD le 28/08 avant le renommage de chemin), il n'y avait
 * aucun moyen de rejouer/récupérer sans attendre le PROCHAIN événement
 * inconnu — un cycle qui ne se termine jamais. Cette fonction permet de
 * reconstruire l'archive à tout moment à partir de ce qui est déjà
 * validé dans Back4App, sans dépendre du calendrier.
 *
 * Ne re-scrape rien (les entrées sont déjà "done", contenu déjà
 * validé) — sert uniquement à (re)peupler l'archive R2 par devise. Voir
 * app/api/cron/central-bank-migrer-archive/route.js.
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
