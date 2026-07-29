// lib/reconnaissance-service.js
import Parse from "./back4app-server";
import { enregistrerReconnaissance } from "./central-bank-pipeline-service";
import { EVENT_TRIGGERS, DEVISE_TO_BANQUE } from "./central-bank-keywords";

/**
 * Construit la date du jour au format EXACT stocké dans CentralBankCalendar :
 * "Weekday Month D YYYY" (ex: "Wednesday July 29 2026"), calculé en
 * timezone Madagascar (GMT+3) pour éviter un décalage d'un jour si le
 * cron s'exécute proche de minuit UTC.
 *
 * ⚠️ Le champ "date" dans Back4App est une STRING, pas un objet Date —
 * confirmé par export CSV. Une comparaison par plage (greaterThanOrEqualTo/
 * lessThanOrEqualTo) sur ce champ ne peut jamais matcher : c'était la
 * cause du bug où toutes les entrées étaient "skipped".
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
 * Lit les événements du jour depuis la classe CentralBankCalendar
 * (déjà alimentée par le cron existant app/api/cron/scraping/route.js,
 * calendrier hebdomadaire TradingEconomics).
 * Exportée pour être réutilisée par app/api/pipeline/run/route.js.
 */
export async function lireEvenementsDuJour() {
  const CentralBankCalendar = Parse.Object.extend("CentralBankCalendar");
  const query = new Parse.Query(CentralBankCalendar);

  const dateDuJour = dateAujourdhuiMadagascar();
  query.equalTo("date", dateDuJour);

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
