// lib/module-synthesis-service.js
//
// Appelle les 5 prompts spécialisés (COT, taux, BC, macro, géopo) —
// chargés depuis prompts/*.txt, pas codés en dur ici — et stocke chaque
// résultat via ecrireSynthese() à synthese/{module}/{date}.json.
//
// FIX (10/09) : les prompts vivent maintenant dans prompts/*.txt pour
// que Belief puisse les ajuster sans toucher au code. Voir next.config.js
// (outputFileTracingIncludes) pour l'inclusion de ces fichiers au build
// Vercel — sans ça, fs.readFileSync() échouerait silencieusement en prod
// tout en marchant en local.
//
// BC EN MODE DÉGRADÉ (10/09, décision explicite) : REGIME_ACTUEL et
// POINT_DE_REFERENCE fixés à "NON_RENSEIGNE" (pas de table de
// calibration par banque). BIAIS_PRECEDENT reste "AUCUN_HISTORIQUE"
// tant que la table derniers_biais_bc n'existe pas.
//
// FIX (10/09) : fallback (FRAIS/DERNIER_CONNU) réservé à BC et macro
// dans synthese-fusion.js — COT et taux sont générés chaque jour
// ouvrable, pas besoin de fallback pour eux ici non plus.

import fs from "fs";
import path from "path";
import { generateText } from "ai";
import { genererCleDuJour, lireJSONDepuisR2 } from "./r2-client";
import { ecrireSynthese } from "./synthese-fusion";
import { recupererTousLesEvenementsDone } from "./central-bank-pipeline-service";

const MODELE = "anthropic/claude-sonnet-5";

async function appelerModele(prompt) {
  const { text } = await generateText({ model: MODELE, prompt });
  return text.trim();
}

function chargerPromptTemplate(nomFichier) {
  const cheminFichier = path.join(process.cwd(), "prompts", nomFichier);
  return fs.readFileSync(cheminFichier, "utf-8");
}

function remplacerVariables(template, variables) {
  let resultat = template;
  for (const [cle, valeur] of Object.entries(variables)) {
    resultat = resultat.split(`{{${cle}}}`).join(valeur);
  }
  return resultat;
}

// -------------------------------------------------------------------------
// RÉCUPÉRATION DES DONNÉES BRUTES
// -------------------------------------------------------------------------

async function recupererDonneesCOT() {
  const cle = genererCleDuJour("cot-precalcul");
  try {
    return await lireJSONDepuisR2(cle);
  } catch (err) {
    console.error(`[cot] lecture ${cle} impossible :`, err.message);
    return null;
  }
}

async function recupererDonneesCourbeDeTaux() {
  const cle = genererCleDuJour("bond-yield-curve");
  try {
    return await lireJSONDepuisR2(cle);
  } catch (err) {
    console.error(`[taux] lecture ${cle} impossible :`, err.message);
    return null;
  }
}

/**
 * Le prompt macro attend contextePartage + data SÉPARÉS (il résout
 * lui-même famillesLiees contre contextePartage) — lecture du fichier
 * brut, pas la version pré-résolue utilisée par l'ancien prompt combiné.
 */
async function recupererDonneesCalendrierBrut() {
  const cle = genererCleDuJour("calendrier-consolide");
  try {
    return await lireJSONDepuisR2(cle);
  } catch (err) {
    console.error(`[macro] lecture ${cle} impossible :`, err.message);
    return null;
  }
}

async function recupererDonneesGeopolitique() {
  const cle = genererCleDuJour("geopolitics-tv5monde");
  try {
    return await lireJSONDepuisR2(cle);
  } catch (err) {
    console.error(`[geopo] lecture ${cle} impossible :`, err.message);
    return null;
  }
}

async function recupererDonneesBanqueCentrale() {
  const resultats = await recupererTousLesEvenementsDone();

  return resultats.map((obj) => ({
    devise: obj.get("deviseDetectee"),
    banqueCentrale: obj.get("banqueCentrale"),
    categorie: obj.get("categorie"),
    evenementNom: obj.get("evenementNom"),
    phrases: obj.get("documentFinal") || [],
  }));
}

// -------------------------------------------------------------------------
// MODULE COT — un appel par devise, biais à confirmer = decision.biais
// -------------------------------------------------------------------------

function construirePromptCOT(devise, entree) {
  const template = chargerPromptTemplate("cot.txt");
  return remplacerVariables(template, {
    DEVISE: devise,
    DATE: entree.reportDate,
    BIAIS_A_CONFIRMER: entree.decision.biais,
    DONNEES_JSON: JSON.stringify(entree, null, 2),
  });
}

export async function genererSyntheseCOT(dateStr) {
  const donnees = await recupererDonneesCOT();
  if (!donnees) return { statut: "SOURCE_ABSENTE" };

  const resultat = {};
  for (const [devise, entree] of Object.entries(donnees)) {
    try {
      const prompt = construirePromptCOT(devise, entree);
      resultat[devise] = await appelerModele(prompt);
    } catch (err) {
      console.error(`[cot] échec génération ${devise} :`, err.message);
    }
  }

  await ecrireSynthese("cot", dateStr, resultat);
  return { statut: "OK", devises: Object.keys(resultat) };
}

// -------------------------------------------------------------------------
// MODULE COURBE DE TAUX — un appel par devise, isolation stricte
// -------------------------------------------------------------------------

function construirePromptTaux(ligneDevise) {
  const template = chargerPromptTemplate("taux.txt");
  return remplacerVariables(template, {
    DONNEES_COURBE: JSON.stringify(ligneDevise, null, 2),
  });
}

export async function genererSyntheseTaux(dateStr) {
  const donnees = await recupererDonneesCourbeDeTaux();
  if (!donnees || !Array.isArray(donnees.resultats)) return { statut: "SOURCE_ABSENTE" };

  const resultat = {};
  for (const ligne of donnees.resultats) {
    try {
      const prompt = construirePromptTaux(ligne);
      resultat[ligne.devise] = await appelerModele(prompt);
    } catch (err) {
      console.error(`[taux] échec génération ${ligne.devise} :`, err.message);
    }
  }

  await ecrireSynthese("taux", dateStr, resultat);
  return { statut: "OK", devises: Object.keys(resultat) };
}

// -------------------------------------------------------------------------
// MODULE GÉOPOLITIQUE — un seul appel
// -------------------------------------------------------------------------

function construirePromptGeopo(donneesGeopo) {
  const template = chargerPromptTemplate("geopo.txt");
  return remplacerVariables(template, {
    DONNEES_GEOPOLITIQUES: JSON.stringify(donneesGeopo, null, 2),
  });
}

function extraireDevisesImpactees(texte) {
  const lignes = texte.split("\n").map((l) => l.trim()).filter(Boolean);
  const devisesImpactees = [];
  const regexLigne = /^([A-Z]{3})\s*[—-]\s*(HAUSSIER|BAISSIER|NEUTRE|INCERTAIN|ON|OFF)\s*[—-]\s*(.+)$/;

  for (const ligne of lignes) {
    const match = ligne.match(regexLigne);
    if (match) {
      devisesImpactees.push({ devise: match[1], direction: match[2], mecanisme: match[3] });
    }
  }
  return devisesImpactees;
}

export async function genererSyntheseGeopo(dateStr) {
  const donnees = await recupererDonneesGeopolitique();
  if (!donnees) return { statut: "SOURCE_ABSENTE" };

  const prompt = construirePromptGeopo(donnees);
  const texte = await appelerModele(prompt);
  const devisesImpactees = extraireDevisesImpactees(texte);

  await ecrireSynthese("geopo", dateStr, { blocAnalytique: texte, devisesImpactees });
  return { statut: "OK", devisesImpactees: devisesImpactees.map((d) => d.devise) };
}

// -------------------------------------------------------------------------
// MODULE MACRO — un appel par devise présente dans "data"
// -------------------------------------------------------------------------

function filtrerContextePourDevise(contextePartage, devise) {
  const filtre = {};
  for (const [famille, parDevise] of Object.entries(contextePartage || {})) {
    if (parDevise && parDevise[devise]) {
      filtre[famille] = { [devise]: parDevise[devise] };
    }
  }
  return filtre;
}

function construirePromptMacro(devise, dataDevise, contextePartageDevise) {
  const template = chargerPromptTemplate("macro.txt");
  return remplacerVariables(template, {
    DEVISE: devise,
    DATA_DEVISE: JSON.stringify(dataDevise, null, 2),
    CONTEXTE_PARTAGE_DEVISE: JSON.stringify(contextePartageDevise, null, 2),
  });
}

export async function genererSyntheseMacro(dateStr) {
  const donnees = await recupererDonneesCalendrierBrut();
  if (!donnees || !Array.isArray(donnees.data)) return { statut: "SOURCE_ABSENTE" };

  const devisesPresentes = [...new Set(donnees.data.map((e) => e.devise))];
  const resultat = {};

  for (const devise of devisesPresentes) {
    try {
      const dataDevise = donnees.data.filter((e) => e.devise === devise);
      const contextePartageDevise = filtrerContextePourDevise(donnees.contextePartage, devise);
      const prompt = construirePromptMacro(devise, dataDevise, contextePartageDevise);
      resultat[devise] = await appelerModele(prompt);
    } catch (err) {
      console.error(`[macro] échec génération ${devise} :`, err.message);
    }
  }

  await ecrireSynthese("macro", dateStr, resultat);
  return { statut: "OK", devises: Object.keys(resultat) };
}

// -------------------------------------------------------------------------
// MODULE BC — MODE DÉGRADÉ
// -------------------------------------------------------------------------

function construirePromptBC(evenement) {
  const template = chargerPromptTemplate("bc.txt");
  return remplacerVariables(template, {
    BANQUE_NOM: evenement.banqueCentrale,
    BANQUE_CODE: evenement.banqueCentrale, // ⚠️ pas de table de mapping code court — à améliorer
    DEVISE: evenement.devise,
    TYPE_DOCUMENT: evenement.categorie || "NON_RENSEIGNE",
    DOCUMENT_ACTUEL: (evenement.phrases || []).join(" "),
    REGIME_ACTUEL: "NON_RENSEIGNE", // ⚠️ mode dégradé
    POINT_DE_REFERENCE: "NON_RENSEIGNE", // ⚠️ mode dégradé
    BIAIS_PRECEDENT: "AUCUN_HISTORIQUE", // ⚠️ table derniers_biais_bc absente
    PROJECTIONS_CHIFFREES: "NON_APPLICABLE_A_CETTE_BANQUE",
    VOTES_DISSENSIONS: "NON_DISPONIBLE",
  });
}

function extraireNarratifEtBiaisBC(texte) {
  const lignes = texte.split("\n").map((l) => l.trim()).filter(Boolean);
  const derniereLigne = lignes[lignes.length - 1];

  let biaisJson = null;
  try {
    biaisJson = JSON.parse(derniereLigne);
  } catch {
    biaisJson = null;
  }

  const narratif = biaisJson ? lignes.slice(0, -1).join(" ") : texte;
  return {
    narratif,
    biais: biaisJson?.biais || "AUCUN_HISTORIQUE",
    conviction: biaisJson?.conviction || "faible",
  };
}

export async function genererSyntheseBC(dateStr) {
  const evenements = await recupererDonneesBanqueCentrale();
  if (!evenements || evenements.length === 0) return { statut: "SOURCE_ABSENTE" };

  const resultat = {};
  for (const evenement of evenements) {
    try {
      const prompt = construirePromptBC(evenement);
      const texte = await appelerModele(prompt);
      resultat[evenement.devise] = extraireNarratifEtBiaisBC(texte);
    } catch (err) {
      console.error(`[bc] échec génération ${evenement.devise} :`, err.message);
    }
  }

  await ecrireSynthese("bc", dateStr, resultat);
  return { statut: "OK", devises: Object.keys(resultat) };
}

// -------------------------------------------------------------------------
// ORCHESTRATEUR
// -------------------------------------------------------------------------

export async function genererToutesLesSynthesesModulaires(dateStr) {
  const resultats = await Promise.allSettled([
    genererSyntheseCOT(dateStr),
    genererSyntheseTaux(dateStr),
    genererSyntheseMacro(dateStr),
    genererSyntheseGeopo(dateStr),
    genererSyntheseBC(dateStr),
  ]);

  const [cot, taux, macro, geopo, bc] = resultats.map((r) =>
    r.status === "fulfilled" ? r.value : { statut: "ERREUR", erreur: r.reason?.message }
  );

  return { dateStr, resultats: { cot, taux, macro, geopo, bc } };
}
