// lib/central-bank-pipeline-service.js
import Parse from "./back4app-server";

const CLASS_NAME = "CentralBankPipeline";

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

  const saved = await entry.save(null, { useMasterKey: true });
  return saved;
}

/**
 * ÉTAPE SOIR — récupère TOUTES les entrées "pending" du jour (plus
 * seulement la première) : chaque événement bancaire détecté doit
 * être scrapé indépendamment.
 */
export async function lireReconnaissancesDuJour() {
  const Pipeline = Parse.Object.extend(CLASS_NAME);
  const query = new Parse.Query(Pipeline);

  query.equalTo("dateTexte", dateAujourdhuiMadagascar());
  query.equalTo("statutScraping", "pending");
  query.limit(1000);

  const resultats = await query.find({ useMasterKey: true });
  return resultats;
}

/**
 * APRÈS SCRAPING + FILTRAGE — met à jour l'entrée avec le document final.
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
