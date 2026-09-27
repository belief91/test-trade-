// scripts/test-bc-state-fed.js
//
// Script de TEST autonome - ferme la boucle complete de la nouvelle
// architecture pour Fed uniquement :
//
//   bc_daily_package -> appel IA (prompt de test isole) -> bc_state
//
// Ne touche PAS a lib/module-synthesis-service.js ni a son prompt de
// production - systemes entierement separes, comme convenu.
//
// Usage : node scripts/test-bc-state-fed.js

import fs from "fs";

async function executer() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });

  const { construireBcDailyPackage } = await import("../lib/bc-state/bc-daily-package.js");
  const { mettreAJourBcState, lireBcState } = await import("../lib/bc-state/bc-state.js");

  console.log("=== Etape 1 : assemblage du paquet ===");
  const paquet = await construireBcDailyPackage("Fed");

  if (!paquet) {
    console.log("Aucun nouveau document depuis la derniere analyse - rien a faire (comportement normal).");
    return;
  }

  console.log(`Reference date : ${paquet.referenceDateUtilisee}`);
  console.log(`Documents nouveaux : ${paquet.newDocuments.length}`);
  console.log(`Etat precedent present : ${paquet.previousState ? "oui" : "non (premiere analyse)"}`);

  console.log("\n=== Etape 2 : appel IA ===");
  const promptSysteme = fs.readFileSync("prompts/test-bc-state-fed.txt", "utf-8");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: promptSysteme,
      messages: [{ role: "user", content: JSON.stringify(paquet, null, 2) }],
    }),
  });

  if (!response.ok) {
    const erreurTexte = await response.text();
    throw new Error(`Erreur API Anthropic : ${response.status} ${erreurTexte}`);
  }

  const data = await response.json();
  const texteBrut = data.content.find((bloc) => bloc.type === "text")?.text || "{}";
  const texteNettoye = texteBrut.replace(/```json|```/g, "").trim();

  let resultatIA;
  try {
    resultatIA = JSON.parse(texteNettoye);
  } catch (err) {
    console.error("Echec du parsing JSON. Reponse brute recue :");
    console.error(texteBrut);
    throw err;
  }

  console.log("Reponse IA parsee avec succes :");
  console.log(JSON.stringify(resultatIA, null, 2));

  console.log("\n=== Etape 3 : ecriture bc_state ===");
  const nouvelEtat = {
    devise: "USD",
    dateAnalyse: new Date().toISOString().split("T")[0],
    ...resultatIA,
    referenceDateUtilisee: paquet.referenceDateUtilisee,
  };

  const etatEcrit = await mettreAJourBcState("Fed", nouvelEtat);
  console.log(`bc_state ecrit avec succes. updatedAt : ${etatEcrit.updatedAt}`);

  console.log("\n=== Verification : relecture de bc_state ===");
  const relu = await lireBcState("Fed");
  console.log(JSON.stringify(relu, null, 2));
}

executer()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur test-bc-state-fed :", err);
    process.exit(1);
  });
