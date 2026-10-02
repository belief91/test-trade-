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
// FIX (30/09) : bc_state s'est retrouve avec AUCUN champ IA
// (biais/conviction/cap/etc totalement absents), sans la moindre
// erreur visible. Cause : `(texteBrut || "{}")` masquait silencieusement
// une reponse vide du modele - JSON.parse("{}") reussit sans jamais
// declencher le catch. Confirme par l'utilisateur sur 2 executions
// identiques. Cause probable : step-3.7-flash est un modele avec
// raisonnement interne, qui peut consommer tout maxOutputTokens en
// reflexion avant d'emettre la reponse finale - 1200 etait trop juste.
//
// Fix applique : maxOutputTokens releve a 4000, log explicite de la
// longueur et d'un apercu de la reponse brute AVANT tout parsing, et
// echec bruyant (throw) si la reponse est vide - plus de fallback
// silencieux vers "{}".
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

  const { generateText } = await import("ai");
  const promptSysteme = fs.readFileSync("prompts/test-bc-state-fed.txt", "utf-8");

  const { text: texteBrut } = await generateText({
    model: MODELE,
    system: promptSysteme,
    prompt: JSON.stringify(paquet, null, 2),
    maxOutputTokens: 4000, // releve de 1200 - un modele a raisonnement peut consommer le budget avant de repondre
  });

  // FIX (30/09) : log explicite AVANT tout parsing, pour voir exactement
  // ce que le modele a renvoye - plus jamais de bug invisible comme celui-ci
  console.log(`Longueur de la reponse brute : ${texteBrut ? texteBrut.length : 0} caracteres`);
  console.log("Apercu (300 premiers caracteres) :");
  console.log(texteBrut ? texteBrut.slice(0, 300) : "(VIDE)");

  if (!texteBrut || texteBrut.trim().length === 0) {
    throw new Error(
      `Le modele ${MODELE} a renvoye une reponse vide. Causes possibles : maxOutputTokens insuffisant pour un modele a raisonnement, ou refus silencieux du modele. Reponse brute complete : "${texteBrut}"`
    );
  }

  const texteNettoye = texteBrut.replace(/```json|```/g, "").trim();

  let resultatIA;
  try {
    resultatIA = JSON.parse(texteNettoye);
  } catch (err) {
    console.error("Echec du parsing JSON. Reponse brute complete recue :");
    console.error(texteBrut);
    throw err;
  }

  // FIX (30/09) : verification que l'objet parse n'est pas vide non plus
  // (un JSON valide mais vide {} passerait le JSON.parse sans erreur)
  if (Object.keys(resultatIA).length === 0) {
    throw new Error(
      `Le modele a renvoye un JSON valide mais VIDE ({}). Reponse brute complete : "${texteBrut}"`
    );
  }

  console.log("\nReponse IA parsee avec succes :");
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
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error("Erreur test-bc-state-fed :", err);
    process.exitCode = 1;
  });
