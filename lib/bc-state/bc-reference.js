// lib/bc-state/bc-reference.js
//
// Table bc_reference - la memoire du dernier grand point monetaire
// officiel. decision = statement. Regroupe autour de la date du dernier
// statement : le statement lui-meme, la presseConference et les minutes
// les plus proches. Ne change que lorsqu'un nouveau statement devient le
// nouveau point d'ancrage.

import { lireJSONDepuisR2, ecrireJSONDansR2 } from "../r2-client.js";
import { lireBcDocuments } from "./bc-documents.js";

function cleR2Reference(banque) {
  return `test/bc-reference/${banque}.json`;
}

export async function lireBcReference(banque) {
  try {
    return await lireJSONDepuisR2(cleR2Reference(banque));
  } catch {
    return null;
  }
}

export async function construireBcReference(banque) {
  const documents = await lireBcDocuments(banque);

  const statements = documents
    .filter((d) => d.categorie === "statement" && d.pubDate)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  if (statements.length === 0) {
    throw new Error(`Aucun statement trouve dans bc_documents pour ${banque} - impossible de construire la reference`);
  }

  const dernierStatement = statements[0];
  const dateAncrage = new Date(dernierStatement.pubDate);

  function appartientAuCycle(doc) {
    if (!doc.pubDate) return false;
    const date = new Date(doc.pubDate);
    return date >= dateAncrage;
  }

  const presseConference = documents
    .filter((d) => d.categorie === "presseConference" && appartientAuCycle(d))
    .sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate))[0] || null;

  const minutes = documents
    .filter((d) => d.categorie === "minutes" && appartientAuCycle(d))
    .sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate))[0] || null;

  const reference = {
    banque,
    referenceDate: dernierStatement.pubDate,
    updatedAt: new Date().toISOString(),
    statement: {
      hash: dernierStatement.hash,
      pubDate: dernierStatement.pubDate,
      documentFinal: dernierStatement.documentFinal,
      source: dernierStatement.source,
    },
    presseConference: presseConference
      ? {
          hash: presseConference.hash,
          pubDate: presseConference.pubDate,
          documentFinal: presseConference.documentFinal,
          source: presseConference.source,
        }
      : null,
    minutes: minutes
      ? {
          hash: minutes.hash,
          pubDate: minutes.pubDate,
          documentFinal: minutes.documentFinal,
          source: minutes.source,
        }
      : null,
  };

  await ecrireJSONDansR2(cleR2Reference(banque), reference);

  return reference;
}
