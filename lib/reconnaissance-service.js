// lib/reconnaissance-service.js
import Parse from "./back4app-server";
import { enregistrerReconnaissance } from "./central-bank-pipeline-service";
import { DEVISE_TO_BANQUE, trouverCategoriePourEvenement } from "./central-bank-keywords";

/**
 * Construit la date du jour au format EXACT stocké dans CentralBankCalendar :
 * "Weekday Month D YYYY", calculé en timezone Madagascar (GMT+3).
 */
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
 * Lit TOUS les événements du jour depuis CentralBankCalendar (aucune
 * limite à un seul résultat).
 */
export async function lireEvenementsDuJour() {
  const CentralBankCalendar = Parse.Object.extend("CentralBankCalendar");
  const query = new Parse.Query(CentralBankCalendar);

  const dateDuJour = dateAujourdhuiMadagascar();
  query.equalTo("date", dateDuJour);
  query.limit(1000);

  const resultats = await query.find({ useMasterKey: true });

  return resultats.map((obj) => ({
    heure: obj.get("heureGmt3"),
    evenement: obj.get("evenement"),
    devise: obj.get("devise"),
  }));
}

/**
 * Détecte TOUS les événements bancaires du jour (pas seulement le
 * premier), chacun associé à sa catégorie précise à scraper.
 * Déduplique par devise+catégorie (si le calendrier liste deux fois
 * le même type d'événement pour la même banque le même jour).
 */
function detecterEvenementsBancaires(evenementsDuJour) {
  const detectes = [];
  const dejaVus = new Set();

  for (const e of evenementsDuJour) {
    const categorie = trouverCategoriePourEvenement(e.evenement);
    if (!categorie) continue; // ne matche aucune catégorie → ignoré

    const banqueCentrale = DEVISE_TO_BANQUE[e.devise] || null;
    if (!banqueCentrale) continue; // devise non reconnue → ignoré

    const cleDedup = `${e.devise}-${categorie}`;
    if (dejaVus.has(cleDedup)) continue;
    dejaVus.add(cleDedup);

    detectes.push({
      devise: e.devise,
      banqueCentrale,
      categorie,
      evenementNom: e.evenement,
      heureEvenement: e.heure,
    });
  }

  return detectes;
}

/**
 * Fonction principale appelée par le cron matin (ou le bouton manuel).
 * Enregistre UNE entrée CentralBankPipeline par événement bancaire
 * détecté aujourd'hui — peut en créer plusieurs si plusieurs banques
 * ou plusieurs catégories sont concernées le même jour.
 * Si aucun événement ne matche → une seule entrée "skip" est créée.
 */
export async function executerReconnaissance() {
  const evenementsDuJour = await lireEvenementsDuJour();
  const evenementsBancaires = detecterEvenementsBancaires(evenementsDuJour);

  if (evenementsBancaires.length === 0) {
    return [
      await enregistrerReconnaissance({
        devise: null,
        banqueCentrale: null,
        categorie: null,
        evenementNom: null,
        heureEvenement: null,
        scrapeTarget: false,
      }),
    ];
  }

  const resultats = [];
  for (const evt of evenementsBancaires) {
    const saved = await enregistrerReconnaissance({
      devise: evt.devise,
      banqueCentrale: evt.banqueCentrale,
      categorie: evt.categorie,
      evenementNom: evt.evenementNom,
      heureEvenement: evt.heureEvenement,
      scrapeTarget: true,
    });
    resultats.push(saved);
  }

  return resultats;
}
