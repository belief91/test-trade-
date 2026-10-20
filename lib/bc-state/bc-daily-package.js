// lib/bc-state/bc-daily-package.js
//
// Construit le paquet exact a envoyer a l'IA pour la synthese
// quotidienne d'une banque : reference (complete ou synthetique selon
// l'anciennete), etat precedent, et documents nouveaux (posterieurs a
// la reference ET jamais analyses).
//
// Optimisation tokens (etape 9 de l'architecture) : si l'etat precedent
// existe deja pour la MEME referenceDate que l'actuelle, la reference
// complete n'est plus renvoyee - seule une version synthetique
// (signaux cles deja extraits par l'IA lors du premier passage,
// stockes dans bc_state.dernierSignal) est utilisee. La reference
// complete n'est renvoyee que lors du premier paquet suivant un nouveau
// statement.
//
// FIX (14/10) : un document etait "nouveau" des qu'il etait posterieur a
// la reference, meme s'il avait deja ete analyse. Constat sur 3 runs
// consecutifs : les 11 memes documents (59 176 caracteres, ~13 000
// tokens) renvoyes a l'IA a chaque execution, et un verdict "confirme"
// rendu sur des documents deja integres a l'etat. L'IA etait donc
// appelee a chaque execution, ce qui contredisait le cas "jour normal,
// pas de nouvelle analyse BC" de l'architecture.
// Desormais bc_state.documentsAnalyses memorise les hashes des documents
// deja analyses POUR LA REFERENCE COURANTE ; ils sont exclus du paquet.
// Quand la reference change (nouveau statement), la liste repart a zero
// (les documents anterieurs a la nouvelle reference sont de toute facon
// exclus par la date).
// Le paquet porte un bloc `meta` (hashes, compteurs) destine au script
// appelant : il doit etre retire AVANT l'envoi a l'IA.

import { lireBcDocuments } from "./bc-documents.js";
import { lireBcReference } from "./bc-reference.js";
import { lireBcState } from "./bc-state.js";

/**
 * Construit le paquet quotidien pour une banque. Retourne null si
 * aucun document a analyser n'existe ET que la reference n'a pas
 * change - dans ce cas, pas besoin d'appeler l'IA (jour normal sans
 * nouveaute, comme prevu par l'architecture : "pas de nouvelle analyse
 * BC").
 */
export async function construireBcDailyPackage(banque, { ignorerSuivi = false } = {}) {
  const reference = await lireBcReference(banque);
  if (!reference) {
    throw new Error(`Aucune bc_reference pour ${banque} - executer construireBcReference() d'abord`);
  }

  const etatPrecedent = await lireBcState(banque);
  const documents = await lireBcDocuments(banque);

  const referenceEstNouvelle =
    !etatPrecedent || etatPrecedent.referenceDateUtilisee !== reference.referenceDate;

  // Hashes deja analyses : valables uniquement pour la reference courante.
  // Etat anterieur a ce fix (champ absent) : liste vide, les documents
  // sont analyses une fois de plus, puis le suivi demarre.
  // ignorerSuivi : ré-analyse volontaire (ex: test avec un autre modèle) -
  // tous les documents posterieurs a la reference repartent vers l'IA
  const documentsAnalysesCumul = referenceEstNouvelle || ignorerSuivi
    ? []
    : etatPrecedent?.documentsAnalyses || [];
  const dejaAnalyses = new Set(documentsAnalysesCumul);

  const hashesReference = new Set(
    [reference.statement?.hash, reference.presseConference?.hash, reference.minutes?.hash].filter(Boolean)
  );

  const dateReference = new Date(reference.referenceDate);

  let nbDejaAnalyses = 0;
  const nouveauxDocuments = documents.filter((doc) => {
    if (hashesReference.has(doc.hash)) return false; // deja dans la reference, pas un "nouveau" document
    if (!doc.pubDate) return false;
    if (!(new Date(doc.pubDate) > dateReference)) return false;
    if (dejaAnalyses.has(doc.hash)) {
      nbDejaAnalyses++;
      return false; // deja analyse lors d'un passage precedent
    }
    return true;
  });

  // Rien a analyser : meme reference qu'avant, tous les documents
  // posterieurs ont deja ete analyses
  if (!referenceEstNouvelle && nouveauxDocuments.length === 0) {
    return null;
  }

  const paquet = {
    banque,
    referenceDateUtilisee: reference.referenceDate,
    reference: referenceEstNouvelle
      ? {
          // Premiere analyse suivant ce statement : reference complete
          date: reference.referenceDate,
          statement: reference.statement.documentFinal,
          presseConference: reference.presseConference?.documentFinal || null,
          minutes: reference.minutes?.documentFinal || null,
        }
      : {
          // Analyses suivantes : version synthetique uniquement (economie
          // de tokens) - keySignals vient du dernier etat IA, pas recalcule ici
          date: reference.referenceDate,
          keySignals: etatPrecedent?.dernierSignal || null,
        },
    previousState: etatPrecedent
      ? {
          biais: etatPrecedent.biais,
          conviction: etatPrecedent.conviction,
          cap: etatPrecedent.cap,
          positionActuelle: etatPrecedent.positionActuelle,
          reactionFuture: etatPrecedent.reactionFuture,
        }
      : null,
    newDocuments: nouveauxDocuments.map((doc) => ({
      categorie: doc.categorie,
      date: doc.pubDate,
      documentFinal: doc.documentFinal,
      source: doc.source,
    })),
    // Bloc technique pour le script appelant - A RETIRER avant l'envoi a l'IA
    meta: {
      referenceEstNouvelle,
      documentsAnalysesCumul,
      hashesNouveauxDocuments: nouveauxDocuments.map((doc) => doc.hash),
      nbDejaAnalyses,
    },
  };

  return paquet;
}
