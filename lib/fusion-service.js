// lib/fusion-service.js
//
// MÉTHODE PAYANTE : appelle automatiquement l'IA sur le prompt de fusion,
// pour chaque devise, à partir de buildDossierDevise() (lib/synthese-fusion.js).
// Combine les résultats en un seul texte et l'enregistre au MÊME endroit
// que la méthode gratuite (enregistrerSynthese("quotidien", ...)) — pour
// que le dashboard affiche identiquement, peu importe la méthode.

import { generateText } from "ai";
import { buildDossierDevise } from "./synthese-fusion";
import { chargerPromptTemplate } from "./module-synthesis-service";
import { enregistrerSynthese } from "./daily-synthesis-service";

const MODELE = "anthropic/claude-sonnet-5";

const DEVISES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"];

function remplacerVariables(template, variables) {
  let resultat = template;
  for (const [cle, valeur] of Object.entries(variables)) {
    resultat = resultat.split(`{{${cle}}}`).join(valeur);
  }
  return resultat;
}

/**
 * Convertit le résultat d'un module (statut + entrées) en texte lisible
 * pour le prompt de fusion. "NON_DISPONIBLE" reste littéral — jamais
 * comblé, conformément à la Section 2 du prompt de fusion.
 */
function formaterModulePourFusion(resultatModule) {
  if (resultatModule.statut === "NON_DISPONIBLE") {
    return "NON_DISPONIBLE";
  }

  return resultatModule.entrees
    .map((entree) => {
      const age = entree.ageJours ? ` (il y a ${entree.ageJours} jour(s))` : "";
      const contenu =
        typeof entree.contenu === "string" ? entree.contenu : JSON.stringify(entree.contenu);
      return `[${entree.date}${age}] ${contenu}`;
    })
    .join("\n\n");
}

async function genererFusionPourDevise(devise, dateDuJour) {
  const dossier = await buildDossierDevise(devise, dateDuJour);
  const template = chargerPromptTemplate("fusion.txt");

  const prompt = remplacerVariables(template, {
    DEVISE: devise,
    DATE: dossier.dateDuJour,
    SYNTHESE_MACRO: formaterModulePourFusion(dossier.modules.macro),
    SYNTHESE_BC: formaterModulePourFusion(dossier.modules.bc),
    SYNTHESE_TAUX: formaterModulePourFusion(dossier.modules.taux),
    SYNTHESE_COT: formaterModulePourFusion(dossier.modules.cot),
    SYNTHESE_GEOPO: formaterModulePourFusion(dossier.modules.geopo),
  });

  const { text } = await generateText({ model: MODELE, prompt });
  return text.trim();
}

/**
 * Génère la fusion pour les 8 devises, combine en un seul texte, et
 * l'enregistre au même endroit que la méthode gratuite. Un échec sur
 * une devise n'empêche pas les autres (Promise.allSettled), cohérent
 * avec genererToutesLesSynthesesModulaires().
 */
export async function genererSyntheseFusion(dateDuJour = new Date()) {
  const resultats = await Promise.allSettled(
    DEVISES.map((devise) => genererFusionPourDevise(devise, dateDuJour))
  );

  const blocs = resultats.map((r, i) => {
    if (r.status === "fulfilled") {
      return r.value;
    }
    console.error(`[fusion] échec ${DEVISES[i]} :`, r.reason?.message);
    return `${DEVISES[i]} — ERREUR DE GÉNÉRATION (${r.reason?.message || "raison inconnue"})`;
  });

  const texteCombine = blocs.join("\n\n---\n\n");

  await enregistrerSynthese("quotidien", texteCombine);

  return {
    statut: "OK",
    devisesTraitees: resultats.filter((r) => r.status === "fulfilled").length,
    devisesEnErreur: resultats.filter((r) => r.status === "rejected").length,
  };
}
