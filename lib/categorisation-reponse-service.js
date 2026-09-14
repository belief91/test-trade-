// lib/categorisation-reponse-service.js
//
// MÉTHODE GRATUITE : reçoit le texte collé depuis Claude chat (la réponse
// aux 5 blocs + fusion assemblés par assemblage-manuel-service.js),
// extrait les 3 éléments utiles et les archive au MÊME endroit que la
// méthode payante — pour que le dashboard affiche identiquement,
// peu importe la méthode qui a produit la donnée.
//
// ===MACRO=== et ===BC=== → ecrireSynthese() (synthese/{module}/{date}.json)
// ===FUSION=== → enregistrerSynthese("quotidien", ...) — LE dashboard
//
// COT, taux, géopo ne sont volontairement PAS archivés ici (cf. décision
// du 10/09 : pas de fallback nécessaire pour eux, donc pas d'archive).

import { ecrireSynthese } from "./synthese-fusion";
import { enregistrerSynthese } from "./daily-synthesis-service";

function dateDuJourGMT3() {
  const maintenant = new Date();
  const offsetGMT3 = 3 * 60;
  const dateGMT3 = new Date(maintenant.getTime() + (offsetGMT3 + maintenant.getTimezoneOffset()) * 60000);
  return dateGMT3.toISOString().split("T")[0];
}

function extraireBloc(texte, marqueur) {
  const regex = new RegExp(`===${marqueur}===\\s*([\\s\\S]*?)(?=\\n===[A-Z]+===|$)`);
  const match = texte.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Claude chat entoure parfois le JSON de ```json ... ``` — on nettoie
 * avant de parser, plutôt que de planter sur un format sinon valide.
 */
function nettoyerBlocJSON(bloc) {
  return bloc
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```\s*$/, "")
    .trim();
}

/**
 * Traite la réponse complète collée depuis Claude chat.
 * @param {string} texteReponse - la réponse brute collée
 * @param {string} [dateStr] - YYYY-MM-DD, par défaut aujourd'hui (GMT+3)
 * @returns {object} rapport de ce qui a été archivé, par élément
 */
export async function traiterReponseChat(texteReponse, dateStr = dateDuJourGMT3()) {
  const rapport = { dateStr, macro: null, bc: null, fusion: null };

  // --- MACRO ---
  const blocMacro = extraireBloc(texteReponse, "MACRO");
  if (blocMacro) {
    try {
      const donnees = JSON.parse(nettoyerBlocJSON(blocMacro));
      await ecrireSynthese("macro", dateStr, donnees);
      rapport.macro = { statut: "OK", devises: Object.keys(donnees) };
    } catch (err) {
      rapport.macro = { statut: "ERREUR_PARSING", detail: err.message, blocBrut: blocMacro.slice(0, 200) };
    }
  } else {
    rapport.macro = { statut: "BLOC_ABSENT" };
  }

  // --- BC ---
  const blocBC = extraireBloc(texteReponse, "BC");
  if (blocBC) {
    try {
      const donnees = JSON.parse(nettoyerBlocJSON(blocBC));
      await ecrireSynthese("bc", dateStr, donnees);
      rapport.bc = { statut: "OK", devises: Object.keys(donnees) };
    } catch (err) {
      rapport.bc = { statut: "ERREUR_PARSING", detail: err.message, blocBrut: blocBC.slice(0, 200) };
    }
  } else {
    rapport.bc = { statut: "BLOC_ABSENT" };
  }

  // --- FUSION (le dashboard) ---
  const blocFusion = extraireBloc(texteReponse, "FUSION");
  if (blocFusion) {
    try {
      await enregistrerSynthese("quotidien", blocFusion);
      rapport.fusion = { statut: "OK" };
    } catch (err) {
      rapport.fusion = { statut: "ERREUR_ENREGISTREMENT", detail: err.message };
    }
  } else {
    rapport.fusion = { statut: "BLOC_ABSENT" };
  }

  return rapport;
}
