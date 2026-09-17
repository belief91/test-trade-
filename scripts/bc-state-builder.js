// scripts/bc-state-builder.js
//
// Orchestrateur de test - prend un fichier historique brut, ingurgite
// dans bc_documents (dedup par hash), puis construit bc_reference.
// Ecrit sous test/ sur R2 pour validation avant integration au pipeline.
//
// Usage :
//   node scripts/bc-state-builder.js <banque> <chemin-du-json>
// Exemple :
//   node scripts/bc-state-builder.js Fed data/test_central-bank-fed.json

import fs from "fs";

const banque = process.argv[2];
const cheminFichier = process.argv[3];

if (!banque || !cheminFichier) {
  console.error("Usage : node scripts/bc-state-builder.js <banque> <chemin-du-json>");
  process.exit(1);
}

async function executer() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });

  const { ingurgiterHistorique } = await import("../lib/bc-state/bc-documents.js");
  const { construireBcReference } = await import("../lib/bc-state/bc-reference.js");

  const brut = fs.readFileSync(cheminFichier, "utf-8");
  const { historique } = JSON.parse(brut);

  console.log(`Entrees brutes dans le fichier : ${historique.length}`);

  const resultatIngestion = await ingurgiterHistorique(banque, historique);
  console.log("\n--- bc_documents ---");
  console.log(`Nouveaux documents : ${resultatIngestion.nouveaux}`);
  console.log(`Deja vus (deduplication) : ${resultatIngestion.dejaVus}`);
  console.log(`Ignores (documentFinal vide) : ${resultatIngestion.ignoresVides}`);
  console.log(`Total dans bc_documents apres fusion : ${resultatIngestion.totalApresDedup}`);

  console.log("\n--- bc_reference ---");
  try {
    const reference = await construireBcReference(banque);
    console.log(`Date d'ancrage (dernier statement) : ${reference.referenceDate}`);
    console.log(`Statement : ${reference.statement.documentFinal.length} phrase(s)`);
    console.log(`Press conference : ${reference.presseConference ? reference.presseConference.documentFinal.length + " phrase(s)" : "absente"}`);
    console.log(`Minutes : ${reference.minutes ? reference.minutes.documentFinal.length + " phrase(s)" : "absentes"}`);
  } catch (err) {
    console.log(`Erreur construction reference : ${err.message}`);
  }
}

executer()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur bc-state-builder :", err);
    process.exit(1);
  });
