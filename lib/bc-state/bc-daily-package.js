// lib/bc-state/bc-daily-package.js
//
// Construit le paquet exact a envoyer a l'IA pour la synthese
// quotidienne d'une banque : reference (complete ou synthetique selon
// l'anciennete), etat precedent, et documents nouveaux (posterieurs a
// la reference, pas encore integres a l'etat).
//
// Optimisation tokens (etape 9 de l'architecture) : si l'etat precedent
// existe deja pour la MEME referenceDate que l'actuelle, la reference
// complete n'est plus renvoyee - seule une version synthetique
// (signaux cles deja extraits par l'IA lors du premier passage,
// stockes dans bc_state.dernierSignal) est utilisee. La reference
// complete n'est renvoyee que lors du premier paquet suivant un nouveau
// statement.

import { lireBcDocuments } from "./bc-documents.js";
import { lireBcReference } from "./bc-reference.js";
import { lireBcState } from "./bc-state.js";

/**
 * Construit le paquet quotidien pour une banque. Retourne null si
 * aucun document nouveau n'existe depuis le dernier etat connu ET que
 * la reference n'a pas change - dans ce cas, pas besoin d'appeler l'IA
 * (jour normal sans nouveaute, comme prevu par l'architecture : "pas de
 * nouvelle analyse BC").
 */
export async function construireBcDailyPackage(banque) {
  const reference = await lireBcReference(banque);
  if (!reference) {
    throw new Error(`Aucune bc_reference pour ${banque} - executer construireBcReference() d'abord`);
  }

  const etatPrecedent = await lireBcState(banque);
  const documents = await lireBcDocuments(banque);

  const hashesReference = new Set(
    [reference.statement?.hash, reference.presseConference?.hash, reference.minutes?.hash].filter(Boolean)
  );

  const dateReference = new Date(reference.referenceDate);

  const nouveauxDocuments = documents.filter((doc) => {
    if (hashesReference.has(doc.hash)) return false; // deja dans la reference, pas un "nouveau" document
    if (!doc.pubDate) return false;
    return new Date(doc.pubDate) > dateReference;
  });

  const referenceEstNouvelle =
    !etatPrecedent || etatPrecedent.referenceDateUtilisee !== reference.referenceDate;

  // Rien de nouveau a analyser : meme reference qu'avant, aucun nouveau
  // document depuis la derniere analyse
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
  };

  return paquet;
}
