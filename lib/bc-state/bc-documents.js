// lib/bc-state/bc-documents.js
//
// Table bc_documents - entrepot deduplique des documents BC bruts.
//
// Sources d'ingestion (aucune ne remplace l'autre) :
//
// 1. executerFlux (lib/bc-state/bc-flux.js) -> ingurgiterHistorique : flux
//    CONTINU de production, entrees {horodatageRun, categorie, status,
//    documentFinal, pubDate, source}. C'est la source de la Fed.
// 2. ingurgiterDepuisArchiveDevise(devise) : flux de production par evenement
//    (database/banque-centrale/{devise}.json). Forme {date, banqueCentrale,
//    categorie, status, documentFinal}, sans pubDate ni source.
// 3. ingurgiterDepuisFichierTest(banque) : ancien fichier du prototype Fed
//    (test/central-bank-fed.json). Conserve, plus utilise par le cron.
//
// IDENTITE D'UN DOCUMENT : son hash, ET sa source quand elle existe. Si une
// URL deja connue revient avec un contenu different (page mise a jour, ou
// filtre ameliore), le document est mis a jour EN PLACE au lieu d'etre
// duplique. Sans cette regle, chaque amelioration du filtre aurait cree une
// seconde version de chaque document, et le controle "plusieurs documents"
// des preuves aurait compte la meme source deux fois.
//
// Chemins R2 : voir bc-chemins.js (database/bc/documents/, repli sur
// test/bc-documents/).

import { lireJSONDepuisR2, ecrireJSONDansR2 } from "../r2-client.js";
import { hasherDocument } from "./hash-document.js";
import {
  cleBcDocuments,
  cleAncienneBcDocuments,
  lireAvecRepli,
  estCleAbsente,
} from "./bc-chemins.js";

function cleR2ArchiveDevise(devise) {
  return `database/banque-centrale/${devise}.json`;
}

// Fichier du flux de test Fed (prototype). Nom exact incertain (tiret ou
// underscore) : on essaie les deux, dans cet ordre.
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
    const contenu = await lireAvecRepli(cleBcDocuments(banque), cleAncienneBcDocuments(banque));
    return contenu.documents || [];
  } catch (err) {
    if (estCleAbsente(err)) return []; // jamais ingere : vide
    throw err; // toute autre erreur : on n'ecrase JAMAIS avec un faux "vide"
  }
}

/**
 * Ingurgite un historique brut dans bc_documents, dedupliquant par hash puis
 * par source. Accepte la forme production ({date,...}) ET la forme flux
 * ({horodatageRun, pubDate, source,...}).
 */
export async function ingurgiterHistorique(banque, historiqueBrut) {
  const documentsExistants = await lireBcDocuments(banque);
  const parHash = new Map(documentsExistants.map((d) => [d.hash, d]));
  const parSource = new Map(documentsExistants.filter((d) => d.source).map((d) => [d.source, d]));

  let nouveaux = 0;
  let dejaVus = 0;
  let misAJour = 0;
  let ignoresVides = 0;
  let ignoresNonOk = 0;

  for (const entree of historiqueBrut) {
    if (entree.status !== "ok") {
      ignoresNonOk++;
      continue; // skip/error/vide_apres_filtre : rien de substantiel a dedupliquer
    }
    if (!entree.documentFinal || entree.documentFinal.length === 0) {
      ignoresVides++;
      continue;
    }

    // Vraie pubDate si disponible (flux), sinon date de scraping
    // (flux par evenement, proxy fiable de la date de publication)
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
        parSource.set(entree.source, existant);
      }
      dejaVus++;
      continue;
    }

    const memeSource = entree.source ? parSource.get(entree.source) : null;
    if (memeSource && memeSource.categorie === entree.categorie) {
      // Meme URL, contenu different : on met a jour EN PLACE
      parHash.delete(memeSource.hash);
      memeSource.hash = hash;
      memeSource.documentFinal = entree.documentFinal;
      memeSource.lastSeenAt = vuLe;
      memeSource.seenCount = (memeSource.seenCount || 1) + 1;
      if (entree.pubDate) memeSource.pubDate = entree.pubDate;
      parHash.set(hash, memeSource);
      misAJour++;
      continue;
    }

    const nouveau = {
      hash,
      banque,
      categorie: entree.categorie,
      documentFinal: entree.documentFinal,
      pubDate: datePublication,
      source: entree.source || null,
      firstSeenAt: vuLe,
      lastSeenAt: vuLe,
      seenCount: 1,
    };
    parHash.set(hash, nouveau);
    if (nouveau.source) parSource.set(nouveau.source, nouveau);
    nouveaux++;
  }

  const documentsFinal = Array.from(parHash.values()).sort(
    (a, b) => timestampDocument(a) - timestampDocument(b)
  );

  await ecrireJSONDansR2(cleBcDocuments(banque), {
    banque,
    updatedAt: new Date().toISOString(),
    count: documentsFinal.length,
    documents: documentsFinal,
  });

  return {
    nouveaux,
    dejaVus,
    misAJour,
    ignoresVides,
    ignoresNonOk,
    totalApresDedup: documentsFinal.length,
  };
}

/**
 * Pont production : lit database/banque-centrale/{devise}.json et
 * l'ingurgite dans bc_documents. Regroupe par banqueCentrale.
 */
export async function ingurgiterDepuisArchiveDevise(devise) {
  let archive;
  try {
    archive = await lireJSONDepuisR2(cleR2ArchiveDevise(devise));
  } catch (err) {
    if (estCleAbsente(err)) {
      return { devise, banques: {}, message: "Aucune archive trouvee pour cette devise" };
    }
    throw err;
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
 * Pont du PROTOTYPE Fed : lit l'ancien fichier de scraping continu
 * (test/central-bank-fed.json). Plus appele par le cron depuis que la Fed
 * passe par le flux de production ; conserve pour memoire.
 */
export async function ingurgiterDepuisFichierTest(banque) {
  let contenu = null;
  let cleUtilisee = null;

  for (const cle of CLES_FICHIER_TEST_FED) {
    try {
      contenu = await lireJSONDepuisR2(cle);
      cleUtilisee = cle;
      break;
    } catch (err) {
      if (!estCleAbsente(err)) throw err;
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
