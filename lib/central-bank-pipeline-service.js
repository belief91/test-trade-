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
 * FALLBACK — récupère le dernier événement bancaire connu avec un
 * document valide, pour une devise ET une catégorie données.
 *
 * FIX (28/08) : deux bugs corrigés ensemble, découverts via une capture
 * d'écran montrant "USD — discours" affichant du contenu (mention
 * d'Alaska, tarifs douaniers) à 14h31, alors que le discours attendu du
 * jour ("fed chair warsh speech") était prévu à 17h00 — donc pas encore
 * prononcé, contenu forcément d'un événement différent.
 *
 * Bug 1 : la fonction ne filtrait PAS par catégorie — un "discours" en
 * échec de scraping pouvait retomber sur un ancien "statement" ou
 * "minutes" de la même devise, un type de document complètement
 * différent.
 *
 * Bug 2 (le plus important) : la donnée de secours était retournée
 * SANS AUCUNE INDICATION qu'il s'agit d'un ancien document et non de la
 * publication du jour — risque réel de confusion pour l'utilisateur ET
 * pour la synthèse IA en aval, qui pourrait interpréter un vieux
 * discours comme le commentaire du jour sur le marché.
 *
 * Retourne désormais un objet explicite plutôt que l'objet Parse brut,
 * avec un flag estDonneeSecours + la date/l'événement d'origine, pour
 * que chaque appelant puisse l'étiqueter clairement au lieu de l'écrire
 * comme si c'était la publication du jour.
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
