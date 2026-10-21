// scripts/test-bc-state-fed.js
//
// Lance l'analyse IA de l'etat BC Fed a la main. Toute la logique vit
// dans lib/bc-state/bc-analyse.js (partagee avec la route automatique
// app/api/cron/bc-state/route.js) - ce script ne fait que l'appeler et
// afficher le resultat.
//
// Ne touche PAS a lib/module-synthesis-service.js ni a son prompt de
// production.
//
// Usage :
//   node scripts/test-bc-state-fed.js
//   node scripts/test-bc-state-fed.js --forcer
//       ecrit bc_state meme si une preuve echoue (etat marque non verifie,
//       aucun document marque comme analyse)
//   node scripts/test-bc-state-fed.js --modele=anthropic/claude-sonnet-5 --refaire
//       test ponctuel avec le modele de production. --refaire est necessaire
//       si les documents ont deja ete analyses (sinon l'IA n'est pas appelee) :
//       il renvoie tous les documents posterieurs a la reference vers l'IA.

import dotenv from "dotenv";

const FORCER = process.argv.includes("--forcer");
const REFAIRE = process.argv.includes("--refaire");
const argModele = process.argv.find((a) => a.startsWith("--modele="));

async function executer() {
  dotenv.config({ path: ".env.local" });

  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error(
      "AI_GATEWAY_API_KEY absente de .env.local (cle Vercel AI Gateway : dashboard > AI Gateway > API Keys)."
    );
  }

  const { analyserBc, MODELE_TEST_PAR_DEFAUT } = await import("../lib/bc-state/bc-analyse.js");

  const resultat = await analyserBc("Fed", {
    modele: argModele ? argModele.split("=")[1] : MODELE_TEST_PAR_DEFAUT,
    forcer: FORCER,
    refaire: REFAIRE,
    log: console.log,
  });

  console.log(`\n=== Resultat : ${resultat.statut} ===`);

  if (resultat.statut === "RIEN_A_ANALYSER") {
    console.log(
      "Aucun document a analyser (meme reference, tous les documents posterieurs ont deja ete analyses) - IA non appelee, comportement normal."
    );
    return;
  }

  if (resultat.statut === "ECHEC_VERIFICATION") {
    console.log(`\n${resultat.echecs.length} echec(s) de verification - bc_state NON ecrit :`);
    for (const e of resultat.echecs) {
      console.log(`  - ${e.raison}`);
      if (e.affirmation) console.log(`      affirmation : ${e.affirmation}`);
    }
    console.log("\nRelancer, ou utiliser --forcer pour ecrire malgre tout.");
    process.exitCode = 1;
    return;
  }

  // OK ou ECRIT_NON_VERIFIE : afficher l'etat ecrit, preuves resolues comprises
  const { etat } = resultat;
  console.log(`bc_state ecrit. updatedAt : ${etat.updatedAt}`);
  console.log(`Documents marques comme analyses : ${resultat.documentsMarquesAnalyses}`);
  console.log(`Preuves : ${resultat.verification.verifiees} / ${resultat.verification.total}`);

  if (resultat.statut === "ECRIT_NON_VERIFIE") {
    console.log(`ATTENTION : ${resultat.echecs.length} echec(s) ignores (--forcer) :`);
    for (const e of resultat.echecs) console.log(`  - ${e.raison}`);
  }

  console.log("\n--- Etat ---");
  console.log(`biais      : ${etat.biais}`);
  console.log(`conviction : ${etat.conviction}`);
  console.log(`cap        : ${etat.cap}`);
  console.log(`dernierSignal : ${etat.dernierSignal}`);
  console.log(`evolution     : ${etat.evolution}`);

  console.log("\n--- Preuves (texte exact retrouve par le code) ---");
  for (const p of etat.preuves) {
    console.log(`\n* ${p.affirmation}`);
    for (const x of p.extraits) {
      console.log(`    [${x.id}] ${x.texte.slice(0, 200)}${x.texte.length > 200 ? "..." : ""}`);
      console.log(`           ${x.source}`);
    }
  }
}

executer().catch((err) => {
  console.error("Erreur test-bc-state-fed :", err.message);
  process.exitCode = 1;
});
