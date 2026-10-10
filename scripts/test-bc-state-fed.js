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
// declencher le catch. Fix : echec bruyant si reponse vide ou JSON vide.
//
// FIX (09/10) : avec un paquet plus gros (une dizaine de discours),
// la reponse est arrivee TRONQUEE en plein milieu d'une chaine
// (1405 caracteres, "Unterminated string in JSON") alors que la limite
// de 4000 tokens etait loin d'etre atteinte par le texte visible. Cause :
// step-3.7-flash est un modele a raisonnement interne dont les tokens de
// reflexion comptent dans maxOutputTokens - il n'est reste qu'une
// centaine de tokens pour ecrire le JSON. Fix : maxOutputTokens releve a
// 12000, paquet envoye en JSON compact, logs de finishReason / usage /
// taille du paquet, et echec explicite si finishReason === "length"
// (jamais de parsing d'un JSON incomplet).
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

  // JSON compact : moins de tokens en entree qu'avec l'indentation
  const promptUtilisateur = JSON.stringify(paquet);
  console.log(`Taille du paquet envoye : ${promptUtilisateur.length} caracteres`);

  const { text: texteBrut, finishReason, usage } = await generateText({
    model: MODELE,
    system: promptSysteme,
    prompt: promptUtilisateur,
    maxOutputTokens: 12000, // un modele a raisonnement depense une grande part du budget en reflexion avant d'ecrire
  });

  console.log(`finishReason : ${finishReason}`);
  console.log(`usage : ${JSON.stringify(usage)}`);

  // Reponse coupee par la limite de tokens : on echoue explicitement,
  // sans tenter de parser un JSON incomplet
  if (finishReason === "length") {
    throw new Error(
      `Reponse tronquee par la limite de tokens (finishReason=length) apres ${texteBrut ? texteBrut.length : 0} caracteres. Relever maxOutputTokens ou reduire la taille du paquet.`
    );
  }

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

  // Un JSON valide mais vide {} passerait JSON.parse sans erreur
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
