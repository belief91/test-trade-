// lib/bc-state/bc-documents.js
//
// Table bc_documents - entrepot deduplique des documents BC bruts.
// Calcule un hash par document, ne garde qu'UNE entree par hash. Un
// document deja vu voit seulement lastSeenAt et seenCount mis a jour.
//
// Stockage : R2, prefixe test/ pour validation avant bascule production.

import { lireJSONDepuisR2, ecrireJSONDansR2 } from "../r2-client.js";
import { hasherDocument } from "./hash-document.js";

function cleR2Documents(banque) {
  return `test/bc-documents/${banque}.json`;
}

export async function lireBcDocuments(banque) {
  try {
    const contenu = await lireJSONDepuisR2(cleR2Documents(banque));
    return contenu.documents || [];
  } catch {
    return [];
  }
}

export async function ingurgiterHistorique(banque, historiqueBrut) {
  const documentsExistants = await lireBcDocuments(banque);
  const parHash = new Map(documentsExistants.map((d) => [d.hash, d]));

  let nouveaux = 0;
  let dejaVus = 0;
  let ignoresVides = 0;

  for (const entree of historiqueBrut) {
    if (!entree.documentFinal || entree.documentFinal.length === 0) {
      ignoresVides++;
      continue;
    }

    const hash = hasherDocument(entree.documentFinal);
    const existant = parHash.get(hash);

    if (existant) {
      existant.lastSeenAt = entree.horodatageRun;
      existant.seenCount = (existant.seenCount || 1) + 1;
      dejaVus++;
    } else {
      parHash.set(hash, {
        hash,
        banque,
        categorie: entree.categorie,
        documentFinal: entree.documentFinal,
        pubDate: entree.pubDate || null,
        source: entree.source || null,
        firstSeenAt: entree.horodatageRun,
        lastSeenAt: entree.horodatageRun,
        seenCount: 1,
      });
      nouveaux++;
    }
  }

  const documentsFinal = Array.from(parHash.values()).sort((a, b) => {
    const dateA = a.pubDate ? new Date(a.pubDate) : new Date(a.firstSeenAt);
    const dateB = b.pubDate ? new Date(b.pubDate) : new Date(b.firstSeenAt);
    return dateA - dateB;
  });

  await ecrireJSONDansR2(cleR2Documents(banque), {
    banque,
    updatedAt: new Date().toISOString(),
    count: documentsFinal.length,
    documents: documentsFinal,
  });

  return { nouveaux, dejaVus, ignoresVides, totalApresDedup: documentsFinal.length };
}
