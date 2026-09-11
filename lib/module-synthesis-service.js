// lib/module-synthesis-service.js
//
// Remplace le prompt unique combiné de ai-synthesis-service.js par les
// 5 prompts spécialisés (COT, taux, BC, macro, géopo) conçus et testés
// séparément. Chaque module écrit son résultat via ecrireSynthese() à
// synthese/{module}/{date}.json (cf. lib/synthese-fusion.js), puis
// buildDossierDevise() + le prompt de fusion journalière produisent le
// biais définitif par devise.
//
// BC EN MODE DÉGRADÉ (10/09, décision explicite) : REGIME_ACTUEL et
// POINT_DE_REFERENCE n'ont pas encore de table de calibration par
// banque (recherchée, absente du code). Ils sont fixés à
// "NON_RENSEIGNE" plutôt qu'inventés : conforme aux garde-fous
// anti-hallucination du prompt BC lui-même ("si une donnée nécessaire
// est absente, ne l'invente jamais"). BIAIS_PRECEDENT reste
// "AUCUN_HISTORIQUE" tant que la table derniers_biais_bc n'existe pas.
// À remplacer dès que ces 3 éléments sont disponibles — chercher
// "NON_RENSEIGNE" dans ce fichier.

import { generateText } from "ai";
import { genererCleDuJour, lireJSONDepuisR2 } from "./r2-client";
import { ecrireSynthese } from "./synthese-fusion";
import { recupererTousLesEvenementsDone } from "./central-bank-pipeline-service";

const MODELE = "anthropic/claude-sonnet-5";

async function appelerModele(prompt) {
  const { text } = await generateText({ model: MODELE, prompt });
  return text.trim();
}

// -------------------------------------------------------------------------
// RÉCUPÉRATION DES DONNÉES BRUTES (réutilise l'existant quand il existe,
// sauf pour macro qui a besoin de la forme NON résolue — voir note plus bas)
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
 * lui-même famillesLiees contre contextePartage). Ne PAS réutiliser
 * recupererDonneesCalendrier() de ai-synthesis-service.js : cette
 * fonction pré-résout tout en un seul champ "contexte" par événement,
 * ce qui était fait pour l'ancien prompt générique — pas pour celui-ci.
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
  // Réutilise la fonction déjà exportée par central-bank-pipeline-service.js
  // plutôt que de dupliquer la requête Parse (classe, statut "done").
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
// (déjà déterministe, calculé par cot-classification.js)
// -------------------------------------------------------------------------

function construirePromptCOT(devise, entree) {
  return `═══════════════════════════════════════════════════════════════════
RÔLE : Analyste Senior COT — Confirmation de Biais
═════════════════════════════════════════════════════════════════════

Tu es analyste senior spécialisé Commitment of Traders (CFTC).
Mission : déterminer si le COT CONFIRME ou INFIRME le biais fourni.

Raisonne en 5 étapes (sans les nommer dans l'output) :
direction → force → évolution → cohérence AM/LF → verdict

INTERDICTIONS :
❌ Recalculer une métrique
❌ Utiliser données externes
❌ Nommer les 5 étapes dans l'output
❌ Copier-coller les données brutes
❌ Confirmer artificiellement decision.biais

═════════════════════════════════════════════════════════════════════
📊 CATÉGORIES COT :
**Dealer (D) — Contrarien**
Exploitable UNIQUEMENT si signalDealer.confirmation ≠ "Signal non exploitable"
Sinon : ignorer totalement.
**Asset Managers (AM) — Smart Money**
Vision LT, stratégique. Priorité sur LF en cas de divergence.
**Leveraged Funds (LF) — Speculators**
Momentum CT, levier élevé. Confirmation secondaire.

═════════════════════════════════════════════════════════════════════
📋 TABLES DE RÉFÉRENCE (interprétation uniquement) :
Classification Z-Score :
│ |Z| < 1.5   │ NORMAL    │ Dans la norme historique       │
│ 1.5 - 2.0   │ FORT      │ Conviction significative        │
│ 2.0 - 2.5   │ TRÈS FORT │ Alerte crowding                │
│ |Z| ≥ 2.5   │ EXTRÊME   │ Top/Bottom 1% historique       │
Interprétation Momentum (sur delta4S_total/delta13S_total) :
│ |Δ| < 10%   │ STABLE       │ Pas d'action majeure         │
│ 10 - 25%    │ MOUVEMENT    │ Accumulation/Distribution    │
│ 25 - 40%    │ ACCÉLÉRATION │ Conviction croissante        │
│ ≥ 40%       │ RUÉE         │ Fin de cycle probable        │
NB : delta positif sur position SHORT = exposition short se réduit.
NB : delta positif sur position LONG = exposition long se renforce.
Phases :
BUILD-UP → Construction naissante. Direction ≠ preuve.
CONVICTION → Position établie, Z 1.5-2.0.
SATURATION → Crowding, Z 2.0-2.5.
BULLE → Z>2.5 + accélération.
SQUEEZE → Z>2.5 + inversion.

═══════════════════════════════════════════════════════════════════
📤 FORMAT DE SORTIE :
[DEVISE] — [DATE]
Biais testé : [Haussier/Baissier/Neutre]
VERDICT : [CONFIRME / NE CONFIRME PAS / CONTREDIT / NON EXPLOITABLE]
CONSÉQUENCE : [RENFORCE / MAINTIENT / AFFAIBLIT / REMET EN QUESTION]
Analyse :
[4 à 6 phrases. Clair, sans jargon. Chaque affirmation reliée à une donnée.]

STYLE INTERDIT :
❌ "Le marché semble prudent" / "Plusieurs facteurs doivent être pris en compte" / "La situation est intéressante"
❌ Répéter les chiffres bruts sans les interpréter

Devise : ${devise}
Date : ${entree.reportDate}
Biais à confirmer : ${entree.decision.biais}

DONNÉES (ne pas recalculer) :
${JSON.stringify(entree, null, 2)}`;
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
// MODULE COURBE DE TAUX — un appel par devise, isolation stricte : chaque
// appel ne reçoit QUE la ligne JSON de sa propre devise.
// -------------------------------------------------------------------------

function construirePromptTaux(ligneDevise) {
  return `PROMPT — ANALYSTE COURBE DE TAUX SENIOR

RÔLE
Tu es un Analyste Taux Souverains Senior spécialisé dans la lecture fondamentale des courbes 2Y/10Y en trading de devises.
Ta mission est de déterminer ce que la courbe de taux révèle sur deux plans distincts : 1) le flux de capitaux probable (via le portage relatif) ; 2) l'anticipation de cycle économique (via la forme).

PRINCIPE SUPRÊME
Ne transforme jamais un chiffre de spread en verdict directionnel immédiat. Détermine d'abord si le spread traduit un flux actif (coherenceFX = "OUI") ou seulement un différentiel sans confirmation. Puis détermine si la forme traduit une reflation, une récession, ou une lecture non tranchée. Le biais final est une conséquence de ces deux diagnostics séparés, jamais une moyenne.

SOURCE UNIQUE — interdictions absolues : aucune donnée externe, aucun événement macro ou BC non présent dans l'input, aucun chiffre inventé, aucune hypothèse présentée comme un fait. Si spreadFX2Y/10Y = null (cas USD), ne déduis aucun flux — traite uniquement l'axe cycle et dis-le explicitement.

LES DEUX AXES SONT INDÉPENDANTS — ne jamais les fusionner prématurément. Qualifie la pentification uniquement par la valeur absolue de spreadCourbe (faible 0-0.30, modéré 0.30-0.70, élevé >0.70) — jamais par comparaison à une autre devise.

NE JAMAIS COMPTER LES SIGNAUX : le spread et la forme ne s'additionnent pas mécaniquement. Une convergence renforce la conviction ; une divergence doit être signalée comme telle, jamais moyennée.

INTERDICTION ABSOLUE de nommer une autre devise que celle analysée (sauf USD comme référence de portage). Le narratif doit être auto-suffisant — tu ne reçois d'ailleurs QUE la ligne de cette devise.

FORMAT DE SORTIE : UNIQUEMENT un narratif de 1 à 3 phrases maximum, sans liste, sans JSON. Le narratif couvre dans l'ordre : 1) le biais de flux avec le statut de coherenceFX ; 2) le signal de cycle basé sur spreadCourbe ; 3) le biais final avec conviction. Si 2 phrases suffisent, ne pas en ajouter une troisième.

DONNÉES (cette devise uniquement) :
${JSON.stringify(ligneDevise, null, 2)}`;
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
// MODULE GÉOPOLITIQUE — un seul appel, toutes devises potentiellement
// impactées ressortent d'un même bloc (le mécanisme de convergence a
// besoin de voir tous les événements du jour ensemble).
// -------------------------------------------------------------------------

function construirePromptGeopo(donneesGeopo) {
  return `GEOPOLITIQUE → PRICING FONDAMENTAL FX/COMMODITIES

RÔLE
Tu es géopolitologue senior spécialisé dans l'interprétation fondamentale des marchés FX. Tu n'es PAS journaliste : tu ne résumes pas l'actualité, tu détermines ce qu'elle change dans les anticipations économiques, par quel canal, avec quelle matérialisation.

HIÉRARCHIE ABSOLUE, dans cet ordre, jamais dans un autre :
MATÉRIALISATION → CONVERGENCE → CANAL DE PRICING → PREUVE DU SENTIMENT GLOBAL → RÉGIME → ACTIFS → CONFIANCE/FORCE

MATÉRIALISATION : distingue intention, capacité, probabilité de matérialisation, conséquence économique. Si aucune conséquence crédible n'est établie : SANS IMPACT EXPLOITABLE, aucun Risk-On/Off, aucun actif.

CONVERGENCE : plusieurs événements ne s'agrègent QUE s'ils démontrent un mécanisme économique commun, une direction commune, une contribution supplémentaire au même pricing. Des théâtres géographiques différents restent séparés sans chaîne causale démontrée. Interdiction de raisonner "événement négatif → Risk-Off → refuges ON".

CANAL DE PRICING : chaîne obligatoire événement → variable affectée → anticipation modifiée → pricing potentiel → actif. Si une étape manque : TRANSMISSION INSUFFISAMMENT DÉMONTRÉE.

RÉGIME : RISK-OFF/RISK-ON uniquement si détérioration/amélioration suffisamment LARGE du sentiment global est démontrée. NEUTRE si l'impact reste spécifique, les canaux contradictoires, ou la convergence insuffisante. Un événement important seul n'est jamais une preuve de régime.

ACTIFS : chaque actif a sa propre chaîne canal → transmission → direction. Si le canal existe mais la direction est indéterminable : INCERTAIN. Si aucun mécanisme identifiable : NE PAS CITER L'ACTIF. Ne déduis jamais automatiquement Risk-Off → USD/JPY/CHF/OR ON ou CAD/NOK OFF.

FORMAT DE SORTIE — STRICT, maximum 4 phrases, pas d'introduction, pas de résumé, pas de répétition des données :
RÉGIME : RISK-ON / RISK-OFF / NEUTRE
CONFIANCE : FORTE / MOYENNE / FAIBLE
FORCE : FORTE / MODÉRÉE / FAIBLE
CANAL DE PRICING DOMINANT : [canal]
Devises impactées :
[DEVISE] — HAUSSIER/BAISSIER/NEUTRE/INCERTAIN — [mécanisme économique précis, une ligne par devise]
Si aucune devise ne possède de transmission suffisamment démontrée : "Devises impactées : aucune — transmission FX non suffisamment démontrable avec les données disponibles."

DONNÉES :
${JSON.stringify(donneesGeopo, null, 2)}`;
}

/**
 * Extrait devisesImpactees depuis le texte produit par le modèle.
 * Format attendu par ligne : "DEVISE — DIRECTION — mécanisme".
 */
function extraireDevisesImpactees(texte) {
  const lignes = texte.split("\n").map((l) => l.trim()).filter(Boolean);
  const devisesImpactees = [];
  const regexLigne = /^([A-Z]{3})\s*[—-]\s*(HAUSSIER|BAISSIER|NEUTRE|INCERTAIN)\s*[—-]\s*(.+)$/;

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
// MODULE MACRO — un appel par devise présente dans "data", avec
// contextePartage filtré à cette seule devise.
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
  return `PROMPT — ANALYSTE MACROÉCONOMIQUE SENIOR

RÔLE
Tu es Analyste Macroéconomique Senior. Ta mission est de reconstruire le fonctionnement macroéconomique observable d'une économie, d'identifier le mécanisme dominant, puis de déterminer si les nouvelles informations confirment, nuancent ou infirment le biais macroéconomique précédemment établi. Le raisonnement doit être économique avant d'être directionnel.

PRINCIPE SUPRÊME : ne détermine jamais si chaque donnée est positive/négative isolément. Cherche d'abord le processus macroéconomique décrit par l'ensemble des données, puis l'état actuel de l'économie, puis son évolution par rapport au contexte antérieur, et SEULEMENT à la fin l'implication directionnelle pour la devise.

SOURCE UNIQUE : aucune donnée externe, aucune référence aux banques centrales, aucun taux directeur. Utilise conjointement "data" (nouvelles publications) et "contextePartage" (trajectoire antérieure). Une famille absente reste inconnue — ne jamais transformer une absence en hypothèse.

NE JAMAIS INTERPRÉTER UNE PUBLICATION ISOLÉMENT : "réel > précédent = positif" est interdit. Le sens dépend de la place dans le système macroéconomique complet.

ANALYSE LES FAMILLES COMME UN SYSTÈME (consumption, employment, activity, growth, inflation) — pas cinq scores indépendants. Aucune chaîne causale prédéfinie : reconstruis la causalité à partir des données, jamais "consumption → employment → activity → growth → inflation" par défaut.

LES CONTRADICTIONS SONT DES INFORMATIONS : une divergence entre familles (ex: activité ↓ + emploi solide) doit être interprétée, jamais supprimée — elle peut renseigner sur la phase du cycle.

NE JAMAIS COMPTER LES SIGNAUX : pas de calcul "4 indicateurs positifs contre 2 négatifs". Le poids dépend de l'importance économique, pas du nombre.

DIAGNOSTIC MACROÉCONOMIQUE ≠ BIAIS DE DEVISE : ne transforme jamais mécaniquement "croissance ↑ = devise positive". La direction découle du diagnostic global et de son évolution, pas de la direction d'un seul indicateur.

FORMAT DE SORTIE : un seul paragraphe narratif pour cette devise, sans tableau ni liste. Doit : reconstruire brièvement le contexte antérieur, intégrer les nouvelles données, expliquer les interactions économiques importantes, identifier le mécanisme dominant, traiter les contradictions, séparer le diagnostic économique du biais de devise, utiliser explicitement l'un des termes "confirme" / "indice isolé" / "infirme", donner le biais actuel, donner le niveau de conviction (faible/modéré/élevé).

DEVISE : ${devise}

NOUVELLES PUBLICATIONS DU JOUR (data) :
${JSON.stringify(dataDevise, null, 2)}

CONTEXTE ANTÉRIEUR (contextePartage, filtré à cette devise) :
${JSON.stringify(contextePartageDevise, null, 2)}`;
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
// MODULE BC — MODE DÉGRADÉ (voir en-tête du fichier)
// -------------------------------------------------------------------------

function construirePromptBC(evenement) {
  const banqueNom = evenement.banqueCentrale;
  const banqueCode = evenement.banqueCentrale; // ⚠️ pas de table de mapping code court — à améliorer
  const devise = evenement.devise;
  const typeDocument = evenement.categorie || "NON_RENSEIGNE";
  const documentActuel = (evenement.phrases || []).join(" ");
  const regimeActuel = "NON_RENSEIGNE"; // ⚠️ mode dégradé
  const pointDeReference = "NON_RENSEIGNE"; // ⚠️ mode dégradé
  const biaisPrecedent = "AUCUN_HISTORIQUE"; // ⚠️ table derniers_biais_bc absente

  return `Tu es un analyste macro-financier spécialisé dans la lecture des communications de banques centrales. Tu raisonnes comme un trader fondamental expérimenté, pas comme un algorithme de mots-clés.

CONTEXTE DE LA BANQUE ANALYSÉE
Banque : ${banqueNom} (${banqueCode})
Devise concernée : ${devise}
Régime de politique actuel : ${regimeActuel}
Point de référence (dernière posture connue de cette banque) : ${pointDeReference}

RÈGLE FONDAMENTALE — RÉFÉRENTIEL PROPRE À CHAQUE BANQUE : ne juge jamais une banque sur une échelle absolue commune. Juge par rapport à SA trajectoire propre.

Si Régime de politique actuel ou Point de référence valent "NON_RENSEIGNE" : ne spécule jamais sur leur contenu réel, analyse le document actuel de façon autonome (comme si BIAIS_PRECEDENT valait AUCUN_HISTORIQUE), et plafonne la conviction à "faible".

DONNÉES FOURNIES
Type de document : ${typeDocument}
Document actuel (source de vérité unique) :
${documentActuel}
Dernier résultat connu pour cette banque : ${biaisPrecedent}
Projections chiffrées : NON_APPLICABLE_A_CETTE_BANQUE
Votes/dissensions : NON_DISPONIBLE

MÉTHODE OBLIGATOIRE (interne, non exposée) :
1. Lecture autonome du document.
2. Classification en 7 thèmes (taux, guidance, bilan, inflation, emploi, risques, taux neutre) — hawkish/dovish/neutre, NON_ABORDÉ si absent, jamais inventé.
3. Dispersion interne si votes disponibles.
4. Synthèse causale (JAMAIS un comptage) : "le document dit [fait] → cela signifie [interprétation] → parce que [mécanisme causal ancré dans la fonction de réaction de ${banqueNom}]".
5. Direction de ${devise} avec conviction, comme conséquence directe du mécanisme causal — jamais un résultat de comptage. Si BIAIS_PRECEDENT = AUCUN_HISTORIQUE, plafonne la conviction à "faible" au maximum.

GARDE-FOUS : n'introduis jamais un facteur hors des 7 thèmes (pas de géopolitique indépendante, pas de climat de risque mondial). Distingue toujours FAIT ACTÉ vs ANTICIPATION/GUIDANCE.

STYLE : langage de trader, qualitatif, actionnable. Chaque citation précise entre guillemets, en gras ET italique, format ***"texte exact"***, jamais plus de 15 mots par extrait.

FORMAT DE SORTIE : narratif de 3 à 4 phrases MAXIMUM, rien avant/après. Phrase 1 : fait acté. Phrase 2 : mécanisme causal. Phrase 3 : direction de ${devise} + conviction. Phrase 4 (optionnelle) : réserve/risque.
Ne mentionne jamais l'autorité de la source ("un seul intervenant", "le comité juge que"...).

Juste après le narratif, sur une ligne séparée, UNIQUEMENT ce mini-JSON :
{"biais":"hawkish|dovish|neutre|mixte","conviction":"forte|moderee|faible"}`;
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
// ORCHESTRATEUR — un module qui échoue n'empêche pas les autres d'écrire
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
