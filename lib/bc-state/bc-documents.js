// lib/bc-state/bc-documents.js
//
// Table bc_documents - entrepot deduplique des documents BC bruts.
//
// Deux sources d'ingestion, chacune pour un usage distinct, AUCUNE ne
// remplace l'autre :
//
// 1. ingurgiterDepuisArchiveDevise(devise) - flux de PRODUCTION
//    (database/banque-centrale/{devise}.json, ecrit par
//    mettreAJourFichierDevise). Forme : {date, banqueCentrale, categorie,
//    status, documentFinal}. Pauvre par nature : n'est alimente que les
//    jours ou un evenement calendrier declenche la reconnaissance.
//
// 2. ingurgiterDepuisFichierTest(banque) - flux du TEST FED
//    (test/central-bank-fed.json), scrape en continu toutes les ~4h,
//    toutes categories confondues. Forme : {horodatageRun, categorie,
//    status, documentFinal, pubDate, source}. Beaucoup plus riche : vraie
//    pubDate et URL source.
//
// FIX (07/10) : le flux de test avait ete ecarte a tort comme "prototype
// oublie" - or c'est la source la plus complete du test Fed (discours,
// minutes, etc. scrapes en continu). ingurgiterHistorique accepte
// desormais les deux formes : pubDate/source/horodatageRun sont utilises
// s'ils sont presents, sinon repli sur `date` (forme production).

import { lireJSONDepuisR2, ecrireJSONDansR2 } from "../r2-client.js";
import { hasherDocument } from "./hash-document.js";

function cleR2Documents(banque) {
  return `test/bc-documents/${banque}.json`;
}

function cleR2ArchiveDevise(devise) {
  return `database/banque-centrale/${devise}.json`;
}

// Le nom exact du fichier de test n'est pas certain (tiret vs underscore
// selon les echanges) - on essaie les deux, dans cet ordre.
const CLES_FICHIER_TEST_FED = [
  "test/central-bank-fed.json",
  "test/central_bank_fed.json",
];

function timestampDocument(doc) {
  const t = new Date(doc.pubDate || doc.firstSeenAt || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
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
 * Ingurgite un historique brut dans bc_documents, dedupliquant par hash.
 * Accepte la forme production ({date,...}) ET la forme test
 * ({horodatageRun, pubDate, source,...}). Retourne le nombre de
 * documents reellement nouveaux vs deja vus.
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

    // Vraie pubDate si disponible (flux test), sinon date de scraping
    // (flux production, proxy fiable de la date de publication)
    const datePublication = entree.pubDate || entree.date || null;
    const vuLe = entree.horodatageRun || entree.date || null;

    const hash = hasherDocument(entree.documentFinal);
    const existant = parHash.get(hash);

    if (existant) {
      existant.lastSeenAt = vuLe;
      existant.seenCount = (existant.seenCount || 1) + 1;
      // Mise a niveau : une vraie pubDate / source remplace un proxy
      // ou un champ manquant d'une ingestion anterieure
      if (entree.pubDate && existant.pubDate !== entree.pubDate) {
        existant.pubDate = entree.pubDate;
      }
      if (entree.source && !existant.source) {
        existant.source = entree.source;
      }
      dejaVus++;
    } else {
      parHash.set(hash, {
        hash,
        banque,
        categorie: entree.categorie,
        documentFinal: entree.documentFinal,
        pubDate: datePublication,
        source: entree.source || null,
        firstSeenAt: vuLe,
        lastSeenAt: vuLe,
        seenCount: 1,
      });
      nouveaux++;
    }
  }

  const documentsFinal = Array.from(parHash.values()).sort(
    (a, b) => timestampDocument(a) - timestampDocument(b)
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
 * Pont production : lit database/banque-centrale/{devise}.json et
 * l'ingurgite dans bc_documents. Regroupe par banqueCentrale.
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

/**
 * Pont TEST Fed : lit le fichier de scraping continu du test Fed
 * (test/central-bank-fed.json ou test/central_bank_fed.json) et
 * l'ingurgite dans bc_documents pour la banque donnee.
 *
 * @param {string} banque - ex: "Fed"
 * @returns {Promise<object>} resultat d'ingestion + cle R2 reellement utilisee
 */
export async function ingurgiterDepuisFichierTest(banque) {
  let contenu = null;
  let cleUtilisee = null;

  for (const cle of CLES_FICHIER_TEST_FED) {
    try {
      contenu = await lireJSONDepuisR2(cle);
      cleUtilisee = cle;
      break;
    } catch {
      // essaie la cle suivante
    }
  }

  if (!contenu) {
    throw new Error(
      `Fichier de test introuvable sur R2. Cles essayees : ${CLES_FICHIER_TEST_FED.join(", ")}`
    );
  }

  const historique = contenu.historique || [];
  const resultat = await ingurgiterHistorique(banque, historique);

  return { cleUtilisee, entreesBrutes: historique.length, ...resultat };
}
