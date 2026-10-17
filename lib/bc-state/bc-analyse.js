// lib/bc-state/bc-analyse.js
//
// Orchestration UNIQUE de l'analyse IA d'une banque centrale :
//
//   bc_daily_package -> numerotation des phrases -> appel IA ->
//   verification des preuves -> bc_state
//
// Utilisee a la fois par le script manuel (scripts/test-bc-state-fed.js)
// et par la route automatique (app/api/cron/bc-state/route.js) : la
// logique ne vit qu'ici, jamais dupliquee entre les deux appelants.
//
// Ne touche pas a lib/module-synthesis-service.js ni a son prompt de
// production - systemes entierement separes.
//
// Historique des fix (repris du script de test) :
// - reponse IA vide masquee par un repli silencieux -> echec bruyant
// - reponse tronquee (tokens de raisonnement comptes dans la sortie) ->
//   maxOutputTokens 12000 + detection de finishReason === "length"
// - preuves par IDENTIFIANTS (lib/bc-state/bc-preuves.js) au lieu de
//   citations a recopier
// - suivi des documents analyses : les hashes ne sont enregistres que si
//   TOUTES les preuves sont verifiees ; un etat force (forcer) ne marque
//   aucun document comme analyse, ils seront revus au passage suivant
//
// Retourne un objet {statut, ...} pour les cas metier (RIEN_A_ANALYSER,
// ECHEC_VERIFICATION, OK, ECRIT_NON_VERIFIE). Les erreurs techniques
// (API, JSON invalide, reponse vide/tronquee) levent une exception.

import fs from "fs";
import path from "path";
import { generateText } from "ai";
import { DEVISE_TO_BANQUE } from "../central-bank-keywords.js";
import { construireBcDailyPackage } from "./bc-daily-package.js";
import { mettreAJourBcState } from "./bc-state.js";
import { numeroterPaquet, verifierPreuves } from "./bc-preuves.js";

export const MODELE_TEST_PAR_DEFAUT = "stepfun/step-3.7-flash";
const FICHIER_PROMPT = "test-bc-state-fed.txt";
const CHAMPS_OBLIGATOIRES = ["biais", "conviction", "cap", "dernierSignal", "evolution"];

function deviseDeLaBanque(banque) {
  const entree = Object.entries(DEVISE_TO_BANQUE).find(([, b]) => b === banque);
  return entree ? entree[0] : null;
}

/**
 * @param {string} banque - ex: "Fed"
 * @param {object} [options]
 * @param {string} [options.modele] - identifiant AI Gateway
 * @param {boolean} [options.forcer] - ecrire bc_state meme si une preuve echoue
 * @param {(msg: string) => void} [options.log]
 * @param {number} [options.maxOutputTokens]
 */
export async function analyserBc(banque, options = {}) {
  const {
    modele = MODELE_TEST_PAR_DEFAUT,
    forcer = false,
    log = () => {},
    maxOutputTokens = 12000,
  } = options;

  log("=== Etape 1 : assemblage du paquet ===");
  const paquetComplet = await construireBcDailyPackage(banque);

  if (!paquetComplet) {
    return { statut: "RIEN_A_ANALYSER" };
  }

  // Le bloc meta est technique : il ne part jamais vers l'IA
  const { meta, ...paquet } = paquetComplet;
  const { paquetNumerote, index, documents } = numeroterPaquet(paquet);

  log(`Reference date : ${paquet.referenceDateUtilisee}`);
  log(`Reference nouvelle : ${meta.referenceEstNouvelle ? "oui" : "non"}`);
  log(`Documents a analyser (jamais analyses) : ${paquet.newDocuments.length}`);
  log(`Documents deja analyses, ignores : ${meta.nbDejaAnalyses}`);
  log(`Etat precedent present : ${paquet.previousState ? "oui" : "non (premiere analyse)"}`);

  log(`\n=== Etape 2 : appel IA (${modele}) ===`);
  const promptSysteme = fs.readFileSync(path.join(process.cwd(), "prompts", FICHIER_PROMPT), "utf-8");
  const promptUtilisateur = JSON.stringify(paquetNumerote);
  log(`Taille du paquet envoye : ${promptUtilisateur.length} caracteres`);

  const { text: texteBrut, finishReason, usage } = await generateText({
    model: modele,
    system: promptSysteme,
    prompt: promptUtilisateur,
    maxOutputTokens, // un modele a raisonnement depense une grande part du budget en reflexion avant d'ecrire
  });

  log(`finishReason : ${finishReason}`);
  log(`usage : ${JSON.stringify(usage)}`);

  if (finishReason === "length") {
    throw new Error(
      `Reponse tronquee par la limite de tokens (finishReason=length) apres ${texteBrut ? texteBrut.length : 0} caracteres. Relever maxOutputTokens ou reduire la taille du paquet.`
    );
  }

  if (!texteBrut || texteBrut.trim().length === 0) {
    throw new Error(
      `Le modele ${modele} a renvoye une reponse vide. Causes possibles : maxOutputTokens insuffisant pour un modele a raisonnement, ou refus silencieux du modele.`
    );
  }

  let resultatIA;
  try {
    resultatIA = JSON.parse(texteBrut.replace(/```json|```/g, "").trim());
  } catch (err) {
    throw new Error(`Reponse du modele non parsable en JSON (${err.message}). Debut de la reponse : ${texteBrut.slice(0, 300)}`);
  }

  const manquants = CHAMPS_OBLIGATOIRES.filter((c) => !resultatIA[c]);
  if (manquants.length > 0) {
    throw new Error(`JSON de l'IA incomplet, champs manquants : ${manquants.join(", ")}. bc_state non ecrit.`);
  }

  log("\n=== Etape 2bis : verification des preuves ===");
  const verification = verifierPreuves(resultatIA, { index, documents });
  log(`Preuves verifiees : ${verification.verifiees} / ${verification.total}`);

  const resumeVerification = {
    total: verification.total,
    verifiees: verification.verifiees,
    echecs: verification.echecs.length,
  };

  if (verification.echecs.length > 0 && !forcer) {
    return {
      statut: "ECHEC_VERIFICATION",
      modele,
      usage,
      verification: resumeVerification,
      echecs: verification.echecs,
    };
  }

  log("\n=== Etape 3 : ecriture bc_state ===");
  const analyseVerifiee = verification.echecs.length === 0;

  // Les documents ne sont marques "analyses" que si l'analyse est
  // entierement verifiee ; sinon ils seront revus au passage suivant
  const documentsAnalyses = analyseVerifiee
    ? [...new Set([...meta.documentsAnalysesCumul, ...meta.hashesNouveauxDocuments])]
    : meta.documentsAnalysesCumul;

  // Les preuves stockees sont les preuves RESOLUES (texte exact retrouve
  // par le code), pas les identifiants bruts renvoyes par le modele
  const { preuves: _preuvesBrutes, ...analyseSansPreuves } = resultatIA;

  const etat = await mettreAJourBcState(banque, {
    devise: deviseDeLaBanque(banque),
    dateAnalyse: new Date().toISOString().split("T")[0],
    ...analyseSansPreuves,
    preuves: verification.preuvesResolues,
    referenceDateUtilisee: paquet.referenceDateUtilisee,
    documentsAnalyses,
    modele,
    verificationPreuves: { ...resumeVerification, forcee: !analyseVerifiee },
  });

  return {
    statut: analyseVerifiee ? "OK" : "ECRIT_NON_VERIFIE",
    modele,
    usage,
    verification: resumeVerification,
    echecs: verification.echecs,
    documentsMarquesAnalyses: documentsAnalyses.length,
    etat,
  };
}
