// scripts/test-filtre-trap-words.js
//
// Script de verification ponctuel - confirme que le fix TRAP_WORDS
// (branche dans paragraph-filter-service.js le 20/09) fonctionne bien
// sur des phrases reelles tirees du discours Fed deja scrape.
//
// Usage : node scripts/test-filtre-trap-words.js

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const { filtrerParagraphes } = await import("../lib/paragraph-filter-service.js");

const testeur = [
  { texte: "As I learned years ago, you can take two different kinds of hikes on the trails around Jackson Hole.", attendu: "EXCLU (hike = randonnee)" },
  { texte: "I can sum up my hikes with former Vice Chairman Don Kohn in two words: I survived.", attendu: "EXCLU (hike = randonnee)" },
  { texte: "There's another kind of hike, one I associate with Chairman Ben Bernanke, my old colleague.", attendu: "EXCLU (hike = randonnee)" },
  { texte: "While uncertainty remains elevated owing, in part, to geopolitical developments, domestic spending has been resilient.", attendu: "A VERIFIER (uncertainty = piege)" },
  { texte: "Inflation remains elevated.", attendu: "INCLUS (inflation = mot fort)" },
  { texte: "Job gains have kept pace with the workforce, and the unemployment rate has changed little.", attendu: "INCLUS (unemployment = mot fort)" },
  { texte: "But, on balance, I would be hard pressed to describe broad financial conditions as restrictive.", attendu: "INCLUS (restrictive = mot fort)" },
];

for (const t of testeur) {
  const resultat = filtrerParagraphes(t.texte, "Fed");
  const statut = resultat.length > 0 ? "INCLUS" : "EXCLU";
  console.log(`[${statut}] (attendu: ${t.attendu})`);
  console.log(`  ${t.texte.slice(0, 80)}...`);
  console.log("");
}
