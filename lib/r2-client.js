// lib/r2-client.js
// Client R2 partagé + fonctions pour retrouver et lire automatiquement
// le dernier fichier cot.json stocké (sans intervention manuelle)

const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");

const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET_NAME = process.env.R2_BUCKET_NAME;

// Retrouve automatiquement la clé du cot.json le plus récent sous raw/{date}/cot.json
async function trouverDernierFichierCOT() {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: "raw/",
  });
  const reponse = await r2Client.send(command);
  const fichiersCOT = (reponse.Contents || [])
    .map(obj => obj.Key)
    .filter(cle => cle.endsWith("/cot.json"))
    .sort();

  if (fichiersCOT.length === 0) throw new Error("Aucun fichier cot.json trouvé sur R2");
  return fichiersCOT[fichiersCOT.length - 1];
}

async function lireJSONDepuisR2(cle) {
  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: cle });
  const reponse = await r2Client.send(command);
  const texte = await reponse.Body.transformToString();
  return JSON.parse(texte);
}

async function ecrireJSONDansR2(cle, data) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: cle,
    Body: JSON.stringify(data, null, 2),
    ContentType: "application/json",
  });
  await r2Client.send(command);
  return cle;
}

/**
 * AJOUT (01/09) — nécessaire pour la réorganisation mensuelle de
 * raw/{date}/ vers raw/{mois}/{jour}/. Gère la pagination (Socrata et R2
 * limitent à 1000 clés par page ; un mois avec ~10 fichiers/jour x 31
 * jours reste sous cette limite, mais on pagine quand même par sécurité
 * plutôt que de supposer que ça ne dépassera jamais).
 */
async function listerObjetsR2(prefix) {
  const toutes = [];
  let continuationToken = undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });
    const reponse = await r2Client.send(command);
    toutes.push(...(reponse.Contents || []).map((o) => o.Key));
    continuationToken = reponse.IsTruncated ? reponse.NextContinuationToken : undefined;
  } while (continuationToken);

  return toutes;
}

/**
 * AJOUT (01/09) — supprime un objet R2. Utilisé uniquement par la
 * réorganisation mensuelle, après confirmation que la copie vers le
 * nouveau chemin a réussi (jamais de suppression avant écriture
 * confirmée de la copie).
 */
async function supprimerObjetR2(cle) {
  const command = new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: cle });
  await r2Client.send(command);
  return cle;
}

function genererCleDuJour(nomModule) {
  const maintenant = new Date();
  const offsetGMT3 = 3 * 60;
  const dateGMT3 = new Date(maintenant.getTime() + (offsetGMT3 + maintenant.getTimezoneOffset()) * 60000);
  const dateStr = dateGMT3.toISOString().split('T')[0];
  return `raw/${dateStr}/${nomModule}.json`;
}

function genererCleArchiveDuJour(nomModule) {
  const maintenant = new Date();
  const offsetGMT3 = 3 * 60;
  const dateGMT3 = new Date(maintenant.getTime() + (offsetGMT3 + maintenant.getTimezoneOffset()) * 60000);
  const dateStr = dateGMT3.toISOString().split('T')[0];
  return `database/${nomModule}/${dateStr}.json`;
}

module.exports = {
  r2Client,
  BUCKET_NAME,
  trouverDernierFichierCOT,
  lireJSONDepuisR2,
  ecrireJSONDansR2,
  listerObjetsR2,
  supprimerObjetR2,
  genererCleDuJour,
  genererCleArchiveDuJour,
};
