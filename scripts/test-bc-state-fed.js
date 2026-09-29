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
// FIX : l'appel IA passe par Vercel AI Gateway (comme le reste du projet)
// au lieu de api.anthropic.com + ANTHROPIC_API_KEY, qui renvoyait
// 401 invalid x-api-key. En local, il faut AI_GATEWAY_API_KEY dans
// .env.local.
//
// FIX (29/09) : anthropic/claude-sonnet-5 est reserve aux comptes avec
// credits payants sur AI Gateway (403 "Free tier users do not have
// access to this model"). Ce script de TEST uniquement bascule sur
// stepfun/step-3.7-flash, disponible avec le quota gratuit de 5$.
// Qualite d'analyse nettement inferieure a Sonnet (index d'intelligence
// ~30-40 contre Sonnet) - NE PAS reporter ce changement sur
// module-synthesis-service.js, fusion-service ou les routes de
// production (cot/analyse, bond-yields/synthesis), qui restent sur
// Sonnet.
//
// Usage : node scripts/test-bc-state-fed.js

import fs from "fs";

const MODELE = "stepfun/step-3.7-flash";

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

  console.log(`\n=== Etape 2 : appel IA (Vercel AI Gateway, ${MODELE}) ===`);
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error(
      "AI_GATEWAY_API_KEY absente de .env.local (cle Vercel AI Gateway : dashboard > AI Gateway > API Keys)."
    );
  }

  // Import apres dotenv.config() pour que la cle soit deja chargee
  const { generateText } = await import("ai");
  const promptSysteme = fs.readFileSync("prompts/test-bc-state-fed.txt", "utf-8");

  const { text: texteBrut } = await generateText({
    model: MODELE,
    system: promptSysteme,
    prompt: JSON.stringify(paquet, null, 2),
    maxOutputTokens: 1200,
  });

  const texteNettoye = (texteBrut || "{}").replace(/```json|```/g, "").trim();

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

// FIX : process.exit() force pendant que des handles reseau se ferment
// provoquait "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" sous
// Windows. process.exitCode laisse Node se terminer proprement.
executer()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error("Erreur test-bc-state-fed :", err);
    process.exitCode = 1;
  });
