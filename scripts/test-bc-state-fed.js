// scripts/test-bc-state-fed.js
//
// Script de TEST autonome - ferme la boucle complete de la nouvelle
// architecture pour Fed uniquement :
//
//   bc_daily_package -> appel IA (prompt de test isole) -> verification
//   des preuves -> bc_state
//
// Ne touche PAS a lib/module-synthesis-service.js ni a son prompt de
// production - systemes entierement separes, comme convenu.
//
// Historique des fix :
// - 30/09 : reponse IA vide masquee par `(texteBrut || "{}")` -> echec
//   bruyant si reponse vide ou JSON vide.
// - 09/10 : reponse tronquee (modele a raisonnement dont les tokens de
//   reflexion comptent dans maxOutputTokens) -> maxOutputTokens 12000,
//   detection de finishReason === "length", logs usage / taille paquet.
// - 12/10 : VERIFICATION DES PREUVES. Constat sur le premier cycle
//   confirme/infirme reel : l'IA surestimait "plusieurs membres" et
//   annoncait "aucun signal contraire" malgre la nuance de Cook sur
//   l'emploi. Le prompt exige un champ `preuves` ({affirmation, source,
//   extrait}) et ce script verifie :
//     1. chaque extrait existe MOT POUR MOT dans le document cite
//     2. chaque source citee existe dans newDocuments (ou "reference")
//     3. tout membre nomme dans l'analyse est etaye par une preuve
//        verifiee provenant de SON discours (nom present dans l'URL)
//   Si une verification echoue, bc_state n'est PAS ecrit : un etat non
//   verifie servirait de previousState et de keySignals au cycle
//   suivant et contaminerait l'historique (un echec visible vaut mieux
//   qu'une corruption silencieuse). --forcer ecrit malgre tout, en
//   marquant l'etat comme non verifie.
//   LIMITE ASSUMEE : ce controle detecte les citations inventees ou
//   mal attribuees, PAS les omissions (ex: une nuance ignoree), ni les
//   affirmations d'ensemble sans preuve ("la majorite du FOMC...").
// - 13/10 : FAUX NEGATIF corrige. Une citation coupee en milieu de
//   phrase par l'IA, avec un point final ajoute, etait rejetee alors
//   que le fragment existait mot pour mot dans le document cite
//   (Jefferson, 1er octobre). La ponctuation finale est desormais
//   ignoree a la comparaison. Garde-fou associe : un extrait de moins
//   de 5 mots est rejete (trop court pour prouver quoi que ce soit).
//
// Usage : node scripts/test-bc-state-fed.js [--forcer]

import fs from "fs";

const MODELE = "stepfun/step-3.7-flash";
const FORCER = process.argv.includes("--forcer");
const MIN_MOTS_EXTRAIT = 5;
const MAX_MOTS_EXTRAIT = 15;

// ─────────────────────────────────────────────────────────────
// Verification des preuves
// ─────────────────────────────────────────────────────────────

function normaliser(texte) {
  return String(texte)
    .toLowerCase()
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Retire guillemets/espaces en tete, et guillemets/ponctuation/points de
// suspension en queue : une citation coupee en milieu de phrase recoit
// souvent un point final que le texte source n'a pas.
function nettoyerExtrait(extrait) {
  return normaliser(extrait)
    .replace(/^[\s"']+/, "")
    .replace(/[\s"'.,;:!?\u2026]+$/, "")
    .trim();
}

function compterMots(texte) {
  return texte.split(/\s+/).filter(Boolean).length;
}

function construireCorpus(paquet) {
  const parSource = new Map();
  for (const doc of paquet.newDocuments || []) {
    const cle = doc.source || "(sans source)";
    const texte = normaliser((doc.documentFinal || []).join(" "));
    parSource.set(cle, `${parSource.get(cle) || ""} ${texte}`);
  }

  let reference = "";
  const ref = paquet.reference || {};
  for (const bloc of [ref.statement, ref.presseConference, ref.minutes]) {
    if (Array.isArray(bloc)) reference += ` ${normaliser(bloc.join(" "))}`;
  }

  return { parSource, reference };
}

function verifierPreuves(resultatIA, paquet) {
  const corpus = construireCorpus(paquet);
  const echecs = [];
  const avertissements = [];
  const preuves = resultatIA.preuves;

  if (!Array.isArray(preuves) || preuves.length === 0) {
    return {
      total: 0,
      verifiees: 0,
      echecs: [{ raison: "champ preuves absent ou vide" }],
      avertissements,
    };
  }

  const preuvesVerifiees = [];

  for (const p of preuves) {
    const extrait = nettoyerExtrait(p?.extrait || "");
    const source = String(p?.source || "").trim();
    const resume = { affirmation: p?.affirmation, source, extrait: p?.extrait };

    if (!extrait) {
      echecs.push({ ...resume, raison: "extrait vide" });
      continue;
    }
    if (!source) {
      echecs.push({ ...resume, raison: "source manquante" });
      continue;
    }

    const nbMots = compterMots(extrait);
    if (nbMots < MIN_MOTS_EXTRAIT) {
      echecs.push({
        ...resume,
        raison: `extrait trop court (${nbMots} mot(s), minimum ${MIN_MOTS_EXTRAIT}) : un fragment aussi bref ne prouve rien`,
      });
      continue;
    }

    let texteCible;
    if (source.toLowerCase() === "reference") {
      texteCible = corpus.reference;
      if (!texteCible.trim()) {
        echecs.push({
          ...resume,
          raison: "source 'reference' citee, mais la reference du paquet est synthetique (aucun texte a verifier)",
        });
        continue;
      }
    } else if (corpus.parSource.has(source)) {
      texteCible = corpus.parSource.get(source);
    } else {
      echecs.push({ ...resume, raison: "source inconnue : cette URL n'est pas dans newDocuments" });
      continue;
    }

    if (!texteCible.includes(extrait)) {
      echecs.push({ ...resume, raison: "extrait introuvable mot pour mot dans le document cite" });
      continue;
    }

    if (nbMots > MAX_MOTS_EXTRAIT) {
      avertissements.push(`extrait de ${nbMots} mots (> ${MAX_MOTS_EXTRAIT}) : "${extrait.slice(0, 60)}..."`);
    }

    preuvesVerifiees.push({ source, extrait });
  }

  // Attributions nominatives : tout membre dont le discours figure dans
  // le paquet et qui est nomme dans l'analyse doit etre etaye par une
  // preuve verifiee provenant de SON document
  const sansPreuves = { ...resultatIA };
  delete sansPreuves.preuves;
  const texteAnalyse = JSON.stringify(sansPreuves);

  const noms = new Set();
  for (const doc of paquet.newDocuments || []) {
    const m = String(doc.source || "").match(/\/speech\/([a-z]+)\d{8}/i);
    if (m) noms.add(m[1].toLowerCase());
  }

  for (const nom of noms) {
    const nomme = new RegExp(`\\b${nom}\\b`, "i").test(texteAnalyse);
    if (!nomme) continue;
    const etaye = preuvesVerifiees.some((pv) => pv.source.toLowerCase().includes(`/${nom}`));
    if (!etaye) {
      echecs.push({
        raison: `attribution nominative sans preuve : "${nom}" est cite dans l'analyse mais aucune preuve verifiee ne provient de son discours`,
      });
    }
  }

  return { total: preuves.length, verifiees: preuvesVerifiees.length, echecs, avertissements };
}

// ─────────────────────────────────────────────────────────────
// Execution
// ─────────────────────────────────────────────────────────────

async function executer() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });

  const { construireBcDailyPackage } = await import("../lib/bc-state/bc-daily-package.js");
  const { mettreAJourBcState, lireBcState } = await import("../lib/bc-state/bc-state.js");

  console.log("=== Etape 1 : assemblage du paquet ===");
  const paquet = await construireBcDailyPackage("Fed");

  if (!paquet) {
    console.log("Aucun nouveau document depuis la derniere analyse - rien a faire (comportement normal).");
    return;
  }

  console.log(`Reference date : ${paquet.referenceDateUtilisee}`);
  console.log(`Documents nouveaux : ${paquet.newDocuments.length}`);
  console.log(`Etat precedent present : ${paquet.previousState ? "oui" : "non (premiere analyse)"}`);

  console.log(`\n=== Etape 2 : appel IA (Vercel AI Gateway, ${MODELE}) ===`);
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error(
      "AI_GATEWAY_API_KEY absente de .env.local (cle Vercel AI Gateway : dashboard > AI Gateway > API Keys)."
    );
  }

  const { generateText } = await import("ai");
  const promptSysteme = fs.readFileSync("prompts/test-bc-state-fed.txt", "utf-8");

  const promptUtilisateur = JSON.stringify(paquet);
  console.log(`Taille du paquet envoye : ${promptUtilisateur.length} caracteres`);

  const { text: texteBrut, finishReason, usage } = await generateText({
    model: MODELE,
    system: promptSysteme,
    prompt: promptUtilisateur,
    maxOutputTokens: 12000, // un modele a raisonnement depense une grande part du budget en reflexion avant d'ecrire
  });

  console.log(`finishReason : ${finishReason}`);
  console.log(`usage : ${JSON.stringify(usage)}`);

  if (finishReason === "length") {
    throw new Error(
      `Reponse tronquee par la limite de tokens (finishReason=length) apres ${texteBrut ? texteBrut.length : 0} caracteres. Relever maxOutputTokens ou reduire la taille du paquet.`
    );
  }

  console.log(`Longueur de la reponse brute : ${texteBrut ? texteBrut.length : 0} caracteres`);

  if (!texteBrut || texteBrut.trim().length === 0) {
    throw new Error(
      `Le modele ${MODELE} a renvoye une reponse vide. Causes possibles : maxOutputTokens insuffisant pour un modele a raisonnement, ou refus silencieux du modele. Reponse brute complete : "${texteBrut}"`
    );
  }

  const texteNettoye = texteBrut.replace(/```json|```/g, "").trim();

  let resultatIA;
  try {
    resultatIA = JSON.parse(texteNettoye);
  } catch (err) {
    console.error("Echec du parsing JSON. Reponse brute complete recue :");
    console.error(texteBrut);
    throw err;
  }

  if (Object.keys(resultatIA).length === 0) {
    throw new Error(
      `Le modele a renvoye un JSON valide mais VIDE ({}). Reponse brute complete : "${texteBrut}"`
    );
  }

  console.log("\nReponse IA parsee avec succes :");
  console.log(JSON.stringify(resultatIA, null, 2));

  console.log("\n=== Etape 2bis : verification des preuves ===");
  const verification = verifierPreuves(resultatIA, paquet);
  console.log(`Preuves verifiees : ${verification.verifiees} / ${verification.total}`);

  for (const a of verification.avertissements) {
    console.log(`  [avertissement] ${a}`);
  }

  if (verification.echecs.length > 0) {
    console.log(`\n${verification.echecs.length} ECHEC(S) de verification :`);
    for (const e of verification.echecs) {
      console.log(`  - ${e.raison}`);
      if (e.affirmation) console.log(`      affirmation : ${e.affirmation}`);
      if (e.source) console.log(`      source      : ${e.source}`);
      if (e.extrait) console.log(`      extrait     : "${e.extrait}"`);
    }

    if (!FORCER) {
      throw new Error(
        `Verification des preuves echouee (${verification.echecs.length} echec(s)) - bc_state NON ecrit, pour ne pas contaminer le cycle suivant avec un etat non verifie. Relancer, ou utiliser --forcer pour ecrire malgre tout.`
      );
    }
    console.log("\n--forcer actif : bc_state sera ecrit, marque comme NON verifie.");
  } else {
    console.log("Toutes les preuves sont verifiees.");
  }

  console.log("\n=== Etape 3 : ecriture bc_state ===");
  const nouvelEtat = {
    devise: "USD",
    dateAnalyse: new Date().toISOString().split("T")[0],
    ...resultatIA,
    referenceDateUtilisee: paquet.referenceDateUtilisee,
    verificationPreuves: {
      total: verification.total,
      verifiees: verification.verifiees,
      echecs: verification.echecs.length,
      forcee: verification.echecs.length > 0,
    },
  };

  const etatEcrit = await mettreAJourBcState("Fed", nouvelEtat);
  console.log(`bc_state ecrit avec succes. updatedAt : ${etatEcrit.updatedAt}`);

  console.log("\n=== Verification : relecture de bc_state ===");
  const relu = await lireBcState("Fed");
  console.log(JSON.stringify(relu, null, 2));
}

executer()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error("Erreur test-bc-state-fed :", err);
    process.exitCode = 1;
  });
