// lib/bc-state/hash-document.js
//
// Normalisation + hash SHA256 d'un document BC, pour la deduplication
// de bc_documents. Confirme par le fichier reel test_central-bank-fed :
// le meme document (meme statement du 29 juillet) reapparait a
// plusieurs horodatageRun differents sans que rien ne le detecte comme
// deja vu.

import { createHash } from "crypto";

export function normaliserDocument(documentFinal) {
  return documentFinal
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function hasherDocument(documentFinal) {
  const normalise = normaliserDocument(documentFinal);
  return createHash("sha256").update(normalise, "utf-8").digest("hex");
}
