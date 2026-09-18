// lib/bc-state/bc-documents.js
//
// Table bc_documents - entrepot deduplique des documents BC bruts.
//
// FIX STRUCTUREL : reecrit pour la VRAIE forme de production, apres
// verification de lib/central-bank-archive-r2.js. Le flux reel
// (database/banque-centrale/{devise}.json) fournit
// {date, banqueCentrale, categorie, status, documentFinal} - PAS de
// pubDate/source/horodatageRun comme le fichier de test prototype qui a
// servi a valider le mecanisme au depart (desormais retire).
//
// `date` (date du scraping, YYYY-MM-DD) est utilisee comme proxy de la
// date de publication reelle : le scraping n'est declenche que le jour
// ou l'evenement calendrier correspondant est detecte
// (reconnaissance-service.js), donc les deux coincident fiablement dans
// l'immense majorite des cas. Seules les entrees status:"ok" avec un
// documentFinal non vide sont ingurgitees - skip/error n'ont rien a
// deduplique.

import { lireJSONDepuisR2, ecrireJSONDansR2 } from "../r2-client.js";
import { hasherDocument } from "./hash-document.js";

function cleR2Documents(banque) {
  return `test/bc-documents/${banque}.json`;
}

function cleR2ArchiveDevise(devise) {
  return `database/banque-centrale/${devise}.json`;
}

export async function lireBcDocuments(banque) {
  try {
    const contenu = await lireJSONDepuisR2(cleR2Documents(banque));
    return contenu.documents || [];
  } catch {
    return [];
  }
}

/**
 * Ingurgite un historique brut (forme reelle de production :
 * {date, banqueCentrale, categorie, status, documentFinal}) dans
 * bc_documents, dedupliquant par hash. Retourne le nombre de documents
 * reellement nouveaux vs deja vus.
 */
export async function ingurgiterHistorique(banque, historiqueBrut) {
  const documentsExistants = await lireBcDocuments(banque);
  const parHash = new Map(documentsExistants.map((d) => [d.hash, d]));

  let nouveaux = 0;
  let dejaVus = 0;
  let ignoresVides = 0;
  let ignoresNonOk = 0;

  for (const entree of historiqueBrut) {
    if (entree.status !== "ok") {
      ignoresNonOk++;
      continue; // skip/error : rien de substantiel a dedupliquer
    }
    if (!entree.documentFinal || entree.documentFinal.length === 0) {
      ignoresVides++;
      continue;
    }

    const hash = hasherDocument(entree.documentFinal);
    const existant = parHash.get(hash);

    if (existant) {
      existant.lastSeenAt = entree.date;
      existant.seenCount = (existant.seenCount || 1) + 1;
      dejaVus++;
    } else {
      parHash.set(hash, {
        hash,
        banque,
        categorie: entree.categorie,
        documentFinal: entree.documentFinal,
        pubDate: entree.date, // proxy fiable de la date de publication reelle
        source: null, // non disponible dans le flux de production actuel
        firstSeenAt: entree.date,
        lastSeenAt: entree.date,
        seenCount: 1,
      });
      nouveaux++;
    }
  }

  const documentsFinal = Array.from(parHash.values()).sort(
    (a, b) => new Date(a.pubDate) - new Date(b.pubDate)
  );

  await ecrireJSONDansR2(cleR2Documents(banque), {
    banque,
    updatedAt: new Date().toISOString(),
    count: documentsFinal.length,
    documents: documentsFinal,
  });

  return { nouveaux, dejaVus, ignoresVides, ignoresNonOk, totalApresDedup: documentsFinal.length };
}

/**
 * Pont production : lit directement database/banque-centrale/{devise}.json
 * (le vrai flux ecrit par mettreAJourFichierDevise a chaque cron) et
 * l'ingurgite dans bc_documents. Regroupe par banqueCentrale au cas ou
 * plusieurs banques partageraient une devise dans le meme fichier
 * (rare mais possible structurellement).
 *
 * @param {string} devise - ex: "USD" (cle du fichier archive)
 * @returns {Promise<object>} resultats d'ingestion par banque touchee
 */
export async function ingurgiterDepuisArchiveDevise(devise) {
  let archive;
  try {
    archive = await lireJSONDepuisR2(cleR2ArchiveDevise(devise));
  } catch {
    return { devise, banques: {}, message: "Aucune archive trouvee pour cette devise" };
  }

  const historique = archive.historique || [];
  const parBanque = new Map();

  for (const entree of historique) {
    const banque = entree.banqueCentrale;
    if (!banque) continue;
    if (!parBanque.has(banque)) parBanque.set(banque, []);
    parBanque.get(banque).push(entree);
  }

  const resultats = {};
  for (const [banque, entrees] of parBanque) {
    resultats[banque] = await ingurgiterHistorique(banque, entrees);
  }

  return { devise, banques: resultats };
}
