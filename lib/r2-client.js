// lib/r2-client.js
// Client R2 partagé + fonctions pour retrouver et lire automatiquement
// le dernier fichier cot.json stocké (sans intervention manuelle)

const { S3Client, GetObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");

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
// (les dates au format YYYY-MM-DD trient correctement en ordre alphabétique = chronologique)
async function trouverDernierFichierCOT() {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: "raw/",
  });
  const reponse = await r2Client.send(command);
  const fichiersCOT = (reponse.Contents || [])
    .map(obj => obj.Key)
    .filter(cle => cle.endsWith("/cot.json"))
    .sort(); // tri croissant, le dernier élément = le plus récent

  if (fichiersCOT.length === 0) throw new Error("Aucun fichier cot.json trouvé sur R2");
  return fichiersCOT[fichiersCOT.length - 1];
}

// Lit et parse automatiquement un objet JSON stocké sur R2
async function lireJSONDepuisR2(cle) {
  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: cle });
  const reponse = await r2Client.send(command);
  const texte = await reponse.Body.transformToString();
  return JSON.parse(texte);
}

// Écrit un objet JSON sur R2 (même convention que les autres modules : raw/{date}/{module}.json)
const { PutObjectCommand } = require("@aws-sdk/client-s3");
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

// Génère une clé raw/{date}/{module}.json avec la date du jour en GMT+3 (Madagascar)
function genererCleDuJour(nomModule) {
  const maintenant = new Date();
  const offsetGMT3 = 3 * 60;
  const dateGMT3 = new Date(maintenant.getTime() + (offsetGMT3 + maintenant.getTimezoneOffset()) * 60000);
  const dateStr = dateGMT3.toISOString().split('T')[0];
  return `raw/${dateStr}/${nomModule}.json`;
}

module.exports = { r2Client, BUCKET_NAME, trouverDernierFichierCOT, lireJSONDepuisR2, ecrireJSONDansR2, genererCleDuJour };
