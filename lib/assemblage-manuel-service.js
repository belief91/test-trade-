// lib/assemblage-manuel-service.js
//
// MÉTHODE GRATUITE : assemble un document unique contenant les 5 prompts
// remplis avec les données du jour (ou la dernière synthèse connue pour
// BC/macro si absents aujourd'hui), suivi du prompt de fusion — prêt à
// coller/uploader dans Claude.ai (chat), en une seule conversation.
//
// Architecture identique à la méthode payante (mêmes données, mêmes
// prompts) — seule différence : pas d'appel API ici, un document texte
// à traiter manuellement, puis à recoller sur le site pour catégorisation
// (voir lib/categorisation-reponse-service.js).

import {
  recupererDonneesCOT,
  recupererDonneesCourbeDeTaux,
  recupererDonneesCalendrierBrut,
  recupererDonneesGeopolitique,
  recupererDonneesBanqueCentrale,
  construirePromptCOT,
  construirePromptTaux,
  construirePromptGeopo,
  construirePromptMacro,
  filtrerContextePourDevise,
  chargerPromptTemplate,
} from "./module-synthesis-service";
import { obtenirDernierFichierModule } from "./synthese-fusion";

function formatDateISO(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function remplacerVariables(template, variables) {
  let resultat = template;
  for (const [cle, valeur] of Object.entries(variables)) {
    resultat = resultat.split(`{{${cle}}}`).join(valeur);
  }
  return resultat;
}

// -------------------------------------------------------------------------
// Bloc COT — direct uniquement (pas de fallback, cf. décision du 10/09)
// -------------------------------------------------------------------------

async function construireBlocCOT() {
  const donnees = await recupererDonneesCOT();
  if (!donnees) {
    return "AUCUNE DONNÉE COT DISPONIBLE AUJOURD'HUI (pas de rapport CFTC ce jour — normal le week-end). Ne pas inventer de synthèse COT.";
  }

  const prompts = Object.entries(donnees)
    .map(([devise, entree]) => construirePromptCOT(devise, entree))
    .join("\n\n---\n\n");

  return `Exécute séparément chacun des prompts COT ci-dessous (un par devise). Restitue le résultat sous forme d'un objet JSON unique : {"DEVISE": "texte complet de l'analyse (verdict + conséquence + analyse)", ...} pour toutes les devises traitées.\n\n${prompts}`;
}

// -------------------------------------------------------------------------
// Bloc TAUX — direct uniquement
// -------------------------------------------------------------------------

async function construireBlocTaux() {
  const donnees = await recupererDonneesCourbeDeTaux();
  if (!donnees || !Array.isArray(donnees.resultats)) {
    return "AUCUNE DONNÉE DE COURBE DE TAUX DISPONIBLE AUJOURD'HUI. Ne pas inventer de synthèse.";
  }

  const prompts = donnees.resultats
    .map((ligne) => construirePromptTaux(ligne))
    .join("\n\n---\n\n");

  return `Exécute séparément chacun des prompts courbe de taux ci-dessous (un par devise). Restitue le résultat sous forme d'un objet JSON unique : {"DEVISE": "narratif de 1 à 3 phrases", ...} pour toutes les devises traitées.\n\n${prompts}`;
}

// -------------------------------------------------------------------------
// Bloc GÉOPOLITIQUE — direct uniquement, un seul appel
// -------------------------------------------------------------------------

async function construireBlocGeopo() {
  const donnees = await recupererDonneesGeopolitique();
  if (!donnees) {
    return "AUCUNE DONNÉE GÉOPOLITIQUE DISPONIBLE AUJOURD'HUI. Ne pas inventer de synthèse.";
  }

  return construirePromptGeopo(donnees);
}

// -------------------------------------------------------------------------
// Bloc MACRO — avec fallback (dernière synthèse déjà produite, pas de
// re-synthèse) si aucune publication calendaire aujourd'hui
// -------------------------------------------------------------------------

async function construireBlocMacro(dateDuJour) {
  const donnees = await recupererDonneesCalendrierBrut();

  if (donnees && Array.isArray(donnees.data) && donnees.data.length > 0) {
    const devisesPresentes = [...new Set(donnees.data.map((e) => e.devise))];
    const prompts = devisesPresentes
      .map((devise) => {
        const dataDevise = donnees.data.filter((e) => e.devise === devise);
        const contextePartageDevise = filtrerContextePourDevise(donnees.contextePartage, devise);
        return construirePromptMacro(devise, dataDevise, contextePartageDevise);
      })
      .join("\n\n---\n\n");

    return `Exécute séparément chacun des prompts macro ci-dessous (un par devise). Restitue le résultat sous forme d'un objet JSON unique : {"DEVISE": "paragraphe narratif complet", ...} pour toutes les devises traitées.\n\n${prompts}`;
  }

  const secours = await obtenirDernierFichierModule("macro", dateDuJour);
  if (secours.statut === "NON_DISPONIBLE") {
    return "AUCUNE DONNÉE MACRO NI SYNTHÈSE DE SECOURS DISPONIBLE. Ne pas inventer de synthèse.";
  }

  return `AUCUNE NOUVELLE PUBLICATION MACRO AUJOURD'HUI. Réutilise TELLE QUELLE la dernière synthèse déjà produite le ${secours.date} (${secours.ageJours} jour(s) d'écart) — NE PAS re-synthétiser, NE PAS reformuler, restitue-la exactement sous forme du même objet JSON :\n\n${JSON.stringify(secours.contenu, null, 2)}`;
}

// -------------------------------------------------------------------------
// Bloc BC — avec fallback, mode dégradé (REGIME_ACTUEL/POINT_DE_REFERENCE
// non renseignés, cf. décision du 10/09)
// -------------------------------------------------------------------------

async function construireBlocBC(dateDuJour) {
  const evenements = await recupererDonneesBanqueCentrale();

  if (evenements && evenements.length > 0) {
    const template = chargerPromptTemplate("bc.txt");
    const prompts = evenements
      .map((evenement) =>
        remplacerVariables(template, {
          BANQUE_NOM: evenement.banqueCentrale,
          BANQUE_CODE: evenement.banqueCentrale,
          DEVISE: evenement.devise,
          TYPE_DOCUMENT: evenement.categorie || "NON_RENSEIGNE",
          DOCUMENT_ACTUEL: (evenement.phrases || []).join(" "),
          REGIME_ACTUEL: "NON_RENSEIGNE",
          POINT_DE_REFERENCE: "NON_RENSEIGNE",
          BIAIS_PRECEDENT: "AUCUN_HISTORIQUE",
          PROJECTIONS_CHIFFREES: "NON_APPLICABLE_A_CETTE_BANQUE",
          VOTES_DISSENSIONS: "NON_DISPONIBLE",
        })
      )
      .join("\n\n---\n\n");

    return `Exécute séparément chacun des prompts BC ci-dessous (un par événement/devise). Restitue le résultat sous forme d'un objet JSON unique : {"DEVISE": {"narratif": "...", "biais": "hawkish|dovish|neutre|mixte", "conviction": "forte|moderee|faible"}, ...} pour toutes les devises traitées.\n\n${prompts}`;
  }

  const secours = await obtenirDernierFichierModule("bc", dateDuJour);
  if (secours.statut === "NON_DISPONIBLE") {
    return "AUCUN ÉVÉNEMENT BC NI SYNTHÈSE DE SECOURS DISPONIBLE. Ne pas inventer de synthèse.";
  }

  return `AUCUN ÉVÉNEMENT BC AUJOURD'HUI. Réutilise TELLE QUELLE la dernière synthèse déjà produite le ${secours.date} (${secours.ageJours} jour(s) d'écart) — NE PAS re-synthétiser, restitue-la exactement sous forme du même objet JSON :\n\n${JSON.stringify(secours.contenu, null, 2)}`;
}

// -------------------------------------------------------------------------
// ASSEMBLAGE FINAL
// -------------------------------------------------------------------------

export async function assemblerDocumentDuJour(dateDuJour = new Date()) {
  const dateStr = formatDateISO(dateDuJour);

  const [blocCOT, blocTaux, blocGeopo, blocMacro, blocBC] = await Promise.all([
    construireBlocCOT(),
    construireBlocTaux(),
    construireBlocGeopo(),
    construireBlocMacro(dateDuJour),
    construireBlocBC(dateDuJour),
  ]);

  let promptFusion;
  try {
    promptFusion = chargerPromptTemplate("fusion.txt");
  } catch {
    promptFusion = "⚠️ prompts/fusion.txt introuvable — voir avec Belief avant de traiter cette section.";
  }

  const instructions = `Tu vas traiter cette tâche en deux temps, dans une seule réponse. Respecte strictement les règles propres à chaque prompt (aucune donnée externe, aucune invention, formats de sortie stricts).

TEMPS 1 — Exécute chacun des 5 blocs ci-dessous. Restitue chaque résultat sous le marqueur indiqué, exactement au format demandé dans chaque bloc.

===COT===
${blocCOT}

===TAUX===
${blocTaux}

===GEOPO===
${blocGeopo}

===MACRO===
${blocMacro}

===BC===
${blocBC}

TEMPS 2 — Une fois les 5 blocs ci-dessus produits, applique le prompt de fusion suivant en utilisant CES MÊMES résultats comme entrée (pas de nouvelles données, pas de recalcul) :

${promptFusion}

Restitue le résultat final sous :
===FUSION===
[biais définitif par devise, selon le format demandé par le prompt de fusion]`;

  return {
    dateStr,
    promptComplet: instructions,
  };
}
