// Script de test autonome — vérifie le service SANS passer par Next.js
//
// Utilisation :
//   1. npm install cheerio   (si pas déjà fait)
//   2. node test-calendar-scraper.mjs
//
// Extension .mjs volontaire : ça force Node à traiter ce fichier comme un
// module ES (import/export), même si ton package.json n'a pas
// "type": "module" — pas besoin de toucher à ta config existante juste
// pour ce test.

import { scraperCalendrierBC } from "./lib/central-bank-calendar-service.js";

async function main() {
  console.log("Lancement du scraping calendrier BC...\n");

  try {
    const evenements = await scraperCalendrierBC();
    console.log(`${evenements.length} événement(s) récupéré(s).\n`);

    for (const e of evenements) {
      console.log("----------------------------------------");
      console.log(`Date       : ${e.date}`);
      console.log(`Heure GMT+3: ${e.heureGmt3}`);
      console.log(`Devise     : ${e.devise}`);
      console.log(`Evenement  : ${e.evenement}`);
      console.log(`Reel       : ${e.reel}`);
      console.log(`Precedent  : ${e.precedent}`);
      console.log(`Consensus  : ${e.consensus}`);
      console.log(`Prevision  : ${e.prevision}`);
      console.log(`Impact     : ${e.impact}`);
    }
  } catch (error) {
    console.error("Erreur pendant le scraping :", error);
    process.exit(1);
  }
}

main();
