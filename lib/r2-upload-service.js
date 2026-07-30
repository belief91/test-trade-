// lib/r2-upload-service.js
// Upload de fichiers vers Cloudflare R2 (compatible API S3)

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT, // https://<account-id>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Upload un contenu texte/JSON vers R2.
 * @param {string} cle - chemin dans le bucket, ex: "synthese/2026-07-29.json"
 * @param {string} contenu - contenu à uploader (texte brut ou JSON.stringify)
 * @param {string} contentType - ex: "application/json", "text/plain"
 */
export async function uploaderVersR2(cle, contenu, contentType = "application/json") {
  const commande = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: cle,
    Body: contenu,
    ContentType: contentType,
  });

  await r2Client.send(commande);
  return { success: true, cle };
}
