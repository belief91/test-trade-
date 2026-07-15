import { enregistrerReconnaissance } from "./central-bank-pipeline-service";
import { EVENT_TRIGGERS, DEVISE_TO_BANQUE } from "./central-bank-keywords";

// ⚠️ PLACEHOLDER — à remplacer une fois la source du calendrier choisie
// Doit retourner un tableau d'objets : [{ heure: "14:30", evenement: "FOMC Statement", devise: "USD" }, ...]
async function scannerCalendrierDuJour() {
  throw new Error(
    "scannerCalendrierDuJour() non implémenté — source du calendrier économique pas encore définie"
  );
}

function contientMotCleEvenement(nomEvenement) {
  const texte = nomEvenement.toLowerCase();
  return EVENT_TRIGGERS.some((mot) => texte.includes(mot));
}

/**
 * Fonction principale appelée par le cron matin.
 * Scanne le calendrier, filtre les events bancaires, enregistre le résultat.
 */
export async function executerReconnaissance() {
  const evenementsDuJour = await scannerCalendrierDuJour();

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
