// scripts/nettoyer-anciens-fichiers-calendrier-r2.js
//
// Supprime les anciens fichiers datés database/calendrier-bc/{date}.json
// (ex: 2026-08-10.json à 2026-08-20.json), désormais remplacés par un
// fichier unique database/calendrier-bc/archive-consolide.json.
// Ne touche JAMAIS à archive-consolide.json lui-même, ni à aucun autre
// fichier R2 hors de ce préfixe précis.
//
// Usage :
//   node scripts/nettoyer-anciens-fichiers-calendrier-r2.js            (dry-run, n'efface rien)
//   node scripts/nettoyer-anciens-fichiers-calendrier-r2.js --confirmer   (efface pour de vrai)

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = await import("@aws-sdk/client-s3");

const CONFIRME = process.argv.includes("--confirmer");
const PREFIX = "database/calendrier-bc/";
const PATTERN_DATE = /^database\/calendrier-bc\/\d{4}-\d{2}-\d{2}\.json$/;

const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function nettoyer() {
  const commandeListe = new ListObjectsV2Command({
    Bucket: process.env.R2_BUCKET_NAME,
    Prefix: PREFIX,
  });
  const reponse = await r2Client.send(commandeListe);
  const objets = reponse.Contents || [];

  console.log(`Objets trouvés sous ${PREFIX} : ${objets.length}`);

  const aSupprimer = objets
    .map((o) => o.Key)
    .filter((cle) => PATTERN_DATE.test(cle)); // exclut archive-consolide.json (ne matche pas le pattern date)

  console.log(`\nFichiers datés à supprimer (${aSupprimer.length}) :`);
  aSupprimer.forEach((cle) => console.log(`  ${cle}`));

  const conserves = objets.map((o) => o.Key).filter((cle) => !aSupprimer.includes(cle));
  console.log(`\nFichiers conservés (${conserves.length}) :`);
  conserves.forEach((cle) => console.log(`  ${cle}`));

  if (!CONFIRME) {
    console.log("\n[DRY-RUN] Aucune suppression effectuée. Relance avec --confirmer pour appliquer.");
    return;
  }

  if (aSupprimer.length === 0) {
    console.log("\nRien à supprimer.");
    return;
  }

  for (const cle of aSupprimer) {
    await r2Client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: cle }));
    console.log(`  Supprimé : ${cle}`);
  }

  console.log(`\n${aSupprimer.length} fichier(s) supprimé(s).`);
}

nettoyer()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur nettoyage R2 :", err);
    process.exit(1);
  });
