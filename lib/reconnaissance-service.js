// lib/reconnaissance-service.js
import Parse from "./back4app-server";
import { enregistrerReconnaissance } from "./central-bank-pipeline-service";
import { EVENT_TRIGGERS, DEVISE_TO_BANQUE } from "./central-bank-keywords";

/**
 * Lit les événements du jour depuis la classe CentralBankCalendar
 * (déjà alimentée par le cron existant app/api/cron/scraping/route.js,
 * calendrier hebdomadaire TradingEconomics).
 * Exportée pour être réutilisée par app/api/pipeline/run/route.js.
 */
export async function lireEvenementsDuJour() {
  const CentralBankCalendar = Parse.Object.extend("CentralBankCalendar");
  const query = new Parse.Query(CentralBankCalendar);

  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);
  const finJour = new Date();
  finJour.setHours(23, 59, 59, 999);

  query.greaterThanOrEqualTo("date", debutJour);
  query.lessThanOrEqualTo("date", finJour);

  const resultats = await query.find({ useMasterKey: true });

  return resultats.map((obj) => ({
    heure: obj.get("heureGmt3"),
    evenement: obj.get("evenement"),
    devise: obj.get("devise"),
  }));
}

/**
 * Exportée pour être réutilisée par app/api/pipeline/run/route.js.
 */
export function contientMotCleEvenement(nomEvenement) {
  if (!nomEvenement) return false;
  const texte = nomEvenement.toLowerCase();
  return EVENT_TRIGGERS.some((mot) => texte.includes(mot));
}

/**
 * Fonction principale appelée par le cron matin.
 */
export async function executerReconnaissance() {
  const evenementsDuJour = await lireEvenementsDuJour();

  const evenementBancaire = evenementsDuJour.find((e) =>
    contientMotCleEvenement(e.evenement)
  );

  if (!evenementBancaire) {
    return await enregistrerReconnaissance({
      devise: null,
      banqueCentrale: null,
      evenementNom: null,
      heureEvenement: null,
      scrapeTarget: false,
    });
  }

  const banqueCentrale = DEVISE_TO_BANQUE[evenementBancaire.devise] || null;

  return await enregistrerReconnaissance({
    devise: evenementBancaire.devise,
    banqueCentrale,
    evenementNom: evenementBancaire.evenement,
    heureEvenement: evenementBancaire.heure,
    scrapeTarget: true,
  });
}
