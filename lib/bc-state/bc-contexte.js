// lib/bc-state/bc-contexte.js
//
// Pont bc_state -> synthese de production. Transforme l'etat courant d'une
// banque en trois variables du prompt BC de production (prompts/bc.txt) qui
// tournaient jusqu'ici en "mode degrade" :
//
//   REGIME_ACTUEL      "NON_RENSEIGNE"    -> taux et orientation actuels
//   POINT_DE_REFERENCE "NON_RENSEIGNE"    -> derniere decision + dernier signal
//   BIAIS_PRECEDENT    "AUCUN_HISTORIQUE" -> {"biais":..., "conviction":...}
//
// Les libelles de bc_state (Hawkish / Elevee...) sont convertis vers ceux du
// mini-JSON du prompt de production (hawkish|dovish|neutre|mixte et
// forte|moderee|faible).
//
// PRUDENCE : retourne null - donc la synthese garde ses valeurs de repli
// actuelles, sans regression - si l'etat est absent, incomplet, a des libelles
// inconnus, ou a ete ecrit avec --forcer (preuves non verifiees). Un etat non
// verifie ne doit jamais servir de point de comparaison a la synthese.
//
// Lecture seule : ce module n'ecrit rien.

import { lireBcState } from "./bc-state.js";

function normaliser(texte) {
  return String(texte || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const BIAIS = { hawkish: "hawkish", dovish: "dovish", neutre: "neutre", mixte: "mixte" };
const CONVICTION = { elevee: "forte", moderee: "moderee", faible: "faible" };

export function construireContexteDepuisEtat(etat) {
  if (!etat) return null;
  if (etat.verificationPreuves?.forcee) return null;

  const biais = BIAIS[normaliser(etat.biais)];
  const conviction = CONVICTION[normaliser(etat.conviction)];
  if (!biais || !conviction) return null;

  const pos = etat.positionActuelle || {};
  const regime = [];
  if (pos.taux) regime.push(`Taux directeur : ${pos.taux}`);
  if (pos.orientation) regime.push(`Orientation : ${pos.orientation}`);

  const reference = [];
  if (etat.referenceDateUtilisee) reference.push(`Dernière décision officielle : ${etat.referenceDateUtilisee}`);
  if (etat.dernierSignal) reference.push(`Dernier signal retenu (analyse du ${etat.dateAnalyse}) : ${etat.dernierSignal}`);

  return {
    regimeActuel: regime.length > 0 ? `${regime.join(". ")}.` : null,
    pointDeReference: reference.length > 0 ? reference.join(". ") : null,
    biaisPrecedent: JSON.stringify({ biais, conviction }),
  };
}

export async function lireContextePourSynthese(banque) {
  if (!banque) return null;
  return construireContexteDepuisEtat(await lireBcState(banque));
}
