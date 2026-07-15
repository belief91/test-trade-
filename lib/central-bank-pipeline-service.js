import Parse from "./back4app-server";

const CLASS_NAME = "CentralBankPipeline";

/**
 * ÉTAPE MATIN — enregistre le résultat de la reconnaissance du calendrier.
 * Appelé par le cron matin après avoir scanné le calendrier et filtré la devise.
 */
export async function enregistrerReconnaissance({
  devise,
  banqueCentrale,
  evenementNom,
  heureEvenement,
  scrapeTarget,
}) {
  const Pipeline = Parse.Object.extend(CLASS_NAME);
  const entry = new Pipeline();

  entry.set("date", new Date());
  entry.set("deviseDetectee", devise || null);
  entry.set("banqueCentrale", banqueCentrale || null);
  entry.set("evenementNom", evenementNom || null);
  entry.set("heureEvenement", heureEvenement || null);
  entry.set("scrapeTarget", !!scrapeTarget);
  entry.set("statutScraping", scrapeTarget ? "pending" : "skipped");
  entry.set("documentFinal", []);

  const saved = await entry.save(null, { useMasterKey: true });
  return saved;
}

/**
 * ÉTAPE SOIR — récupère l'entrée du jour marquée "pending".
 * Appelé par le cron soir avant de réveiller Render.
 */
export async function lireReconnaissanceDuJour() {
  const Pipeline = Parse.Object.extend(CLASS_NAME);
  const query = new Parse.Query(Pipeline);

  query.equalTo("statutScraping", "pending");
  query.descending("createdAt");

  const result = await query.first({ useMasterKey: true });
  return result; // null si rien trouvé → skip
}

/**
 * APRÈS SCRAPING + FILTRAGE — met à jour l'entrée avec le document final.
 * Appelé par le cron soir (ou le bouton manuel) après le retour de Render.
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
 * FALLBACK — récupère le dernier événement bancaire connu avec un document valide.
 * Appelé quand le jour courant est un SKIP total (rien détecté ou aucun mot-clé trouvé).
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
  return result; // null si aucun historique existant
}