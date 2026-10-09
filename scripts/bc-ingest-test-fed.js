// scripts/bc-ingest-test-fed.js
//
// Ingere le fichier de scraping continu du test Fed dans bc_documents
// (dedup par hash), reconstruit bc_reference, puis liste les documents
// POSTERIEURS a la reference - c'est-a-dire la matiere reelle du test
// confirme/nuance/infirme. N'appelle aucune IA, ne modifie pas bc_state.
//
// Usage : node scripts/bc-ingest-test-fed.js

async function executer() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });

  const { ingurgiterDepuisFichierTest, lireBcDocuments } = await import("../lib/bc-state/bc-documents.js");
  const { construireBcReference } = await import("../lib/bc-state/bc-reference.js");

  console.log("=== Etape 1 : ingestion du fichier de test Fed -> bc_documents ===");
  const ingestion = await ingurgiterDepuisFichierTest("Fed");
  console.log(`Fichier lu : ${ingestion.cleUtilisee}`);
  console.log(`Entrees brutes : ${ingestion.entreesBrutes}`);
  console.log(`Nouveaux documents uniques : ${ingestion.nouveaux}`);
  console.log(`Deja vus (doublons) : ${ingestion.dejaVus}`);
  console.log(`Ignores (non ok) : ${ingestion.ignoresNonOk}`);
  console.log(`Ignores (documentFinal vide) : ${ingestion.ignoresVides}`);
  console.log(`Total bc_documents apres fusion : ${ingestion.totalApresDedup}`);

  console.log("\n=== Etape 2 : reconstruction bc_reference ===");
  const reference = await construireBcReference("Fed");
  console.log(`Date d'ancrage : ${reference.referenceDate}`);
  console.log(`Statement : ${reference.statement.documentFinal.length} phrase(s)`);
  console.log(`Press conference : ${reference.presseConference ? reference.presseConference.documentFinal.length + " phrase(s)" : "absente"}`);
  console.log(`Minutes : ${reference.minutes ? reference.minutes.documentFinal.length + " phrase(s)" : "absentes"}`);

  console.log("\n=== Etape 3 : documents posterieurs a la reference ===");
  const documents = await lireBcDocuments("Fed");
  const dateRef = new Date(reference.referenceDate);
  const hashesRef = new Set(
    [reference.statement?.hash, reference.presseConference?.hash, reference.minutes?.hash].filter(Boolean)
  );

  const posterieurs = documents
    .filter((d) => d.pubDate && !hashesRef.has(d.hash) && new Date(d.pubDate) > dateRef)
    .sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));

  console.log(`Nombre : ${posterieurs.length}`);
  for (const d of posterieurs) {
    console.log(` - ${d.pubDate} | ${d.categorie} | ${d.documentFinal.length} phrase(s) | ${d.source || "(source inconnue)"}`);
  }

  if (posterieurs.length === 0) {
    console.log("\nAucun document posterieur - rien a tester pour le moment.");
  } else {
    console.log("\nPret : lancer maintenant  node scripts/test-bc-state-fed.js");
  }
}

executer()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error("Erreur bc-ingest-test-fed :", err);
    process.exitCode = 1;
  });
