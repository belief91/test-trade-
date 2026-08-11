// lib/ai-synthesis-service.js
//
// FIX MAJEUR : les précalculs cot-analytics.js / cot-classification.js /
// bond-yield-curve-analysis.js existaient déjà mais n'étaient jamais
// appelés ici — l'IA recevait des données BRUTES (fetchCOT() snapshot,
// mapping Parse brut des rendements). Cause confirmée des symptômes :
// "calculs COT/courbe de taux ne fonctionnent pas avant transmission IA"
// et "données précalculées absentes de R2".
//
// Corrections apportées :
//   1. recupererDonneesCOT() passe maintenant par fetchHistoriqueCOT()
//      -> calculerAnalyticsToutesDevises() -> classifierCOT()
//   2. recupererDonneesCourbeDeTaux() mappe les champs Parse (français :
//      devise/maturite/rendement/pays) vers le format anglais attendu par
//      analyserCourbesDeTaux() (currency/maturity/yield/country) — cette
//      incompatibilité de noms empêchait toute utilisation du module.
//   3. Les deux résultats précalculés sont archivés sur R2 AVANT l'appel
//      IA (raw/{date}/cot-analytics.json et raw/{date}/bond-yield-curve.json)
//   4. Garde-fou SYNTHESE_SUSPENDUE ajouté dans les deux fonctions
//      génératrices, en cohérence avec le fix du cron.
//
// NOTE : fix du nom de fichier appliqué dans macro-consolidator-service.js
// (voir ce fichier) — config/config_macro-knowledge-base.json et non
// config/macro-knowledge-base.json comme le code l'attendait, causant
// "Module not found" au build.
//
// ATTENTION NON VÉRIFIÉE : cot-analytics.js exporte en CommonJS
// (module.exports), ce fichier est en ESM (import). Next.js gère
// normalement l'interop automatiquement, mais si le build casse sur cet
// import précis, c'est le premier endroit à vérifier.

import { generateText } from "ai";
import Parse from "./back4app-server";
import { fetchHistoriqueCOT } from "./cot-historique-r2";
import { calculerAnalyticsToutesDevises } from "./cot-analytics";
import { classifierCOT } from "./cot-classification";
import { analyserCourbesDeTaux } from "./bond-yield-curve-analysis";
import { uploaderVersR2 } from "./r2-upload-service";
import { genererCleDuJour, lireJSONDepuisR2 } from "./r2-client";

const MODELE = "anthropic/claude-sonnet-5";

async function recupererDonneesBanqueCentrale() {
  const CentralBankPipeline = Parse.Object.extend("CentralBankPipeline");
  const query = new Parse.Query(CentralBankPipeline);
  query.equalTo("statutScraping", "done");
  query.descending("date");
  query.limit(50);

  const resultats = await query.find({ useMasterKey: true });

  return resultats.map((obj) => ({
    devise: obj.get("deviseDetectee"),
    banqueCentrale: obj.get("banqueCentrale"),
    categorie: obj.get("categorie"),
    evenementNom: obj.get("evenementNom"),
    phrases: obj.get("documentFinal") || [],
  }));
}

/**
 * FIX : lit désormais le fichier CONSOLIDÉ sur R2 (produit par
 * /api/central-bank-calendar via macro-consolidator-service.js), au lieu
 * d'interroger CentralBankCalendar brut. L'IA reçoit maintenant le
 * contexte macro par famille (confirm_with, surprise vs consensus,
 * publications récentes liées) plutôt que des lignes de calendrier
 * isolées sans lien entre elles — condition nécessaire à un vrai
 * narratif macroéconomique plutôt qu'une liste de faits juxtaposés.
 *
 * ORDRE DES CRONS — POINT DE VIGILANCE NON VÉRIFIÉ : cette fonction
 * suppose que /api/central-bank-calendar (qui écrit calendrier-consolide)
 * s'est déjà exécuté AUJOURD'HUI avant que /api/cron/synthese-quotidienne
 * ne tourne. Je n'ai pas les fichiers de cron GitHub Actions pour
 * confirmer cet ordre — à vérifier de ton côté. Si le fichier du jour
 * n'existe pas encore, la fonction retombe sur un tableau vide plutôt
 * que de planter (dégradation silencieuse mais sans erreur bloquante).
 */
async function recupererDonneesCalendrier() {
  const cle = genererCleDuJour("calendrier-consolide");
  try {
    const { data } = await lireJSONDepuisR2(cle);
    return data || [];
  } catch (err) {
    console.error(`Erreur lecture calendrier consolidé (${cle}) :`, err.message);
    return [];
  }
}

/**
 * COT — remplace fetchCOT() (snapshot brut) par le pipeline complet :
 * historique -> Z-Score/percentile (cot-analytics) -> classification
 * déterministe (cot-classification). L'IA reçoit désormais un objet
 * DÉJÀ interprété, plus jamais des positions brutes à calculer elle-même.
 */
async function recupererDonneesCOT() {
  const dateDebut = new Date();
  dateDebut.setDate(dateDebut.getDate() - 110 * 7); // ~110 semaines : couvre la fenêtre 104S + marge Δ13S
  const dateDebutStr = dateDebut.toISOString().split("T")[0];

  const parDevise = await fetchHistoriqueCOT(dateDebutStr);
  const analytics = calculerAnalyticsToutesDevises(parDevise);

  const classifie = {};
  for (const [devise, analyse] of Object.entries(analytics)) {
    classifie[devise] = classifierCOT(analyse);
  }
  return classifie;
}

/**
 * Courbe de taux — remplace le mapping français brut par le calcul
 * complet des spreads/forme de courbe/cohérence FX (bond-yield-curve-analysis).
 * Mapping des champs Parse -> noms attendus par analyserCourbesDeTaux
 * (currency/maturity/yield/country), qui étaient auparavant incompatibles
 * avec les noms français utilisés ici (devise/maturite/rendement/pays).
 */
async function recupererDonneesCourbeDeTaux() {
  const BondYieldMaturity = Parse.Object.extend("BondYieldMaturity");
  const query = new Parse.Query(BondYieldMaturity);
  query.limit(1000);

  const resultats = await query.find({ useMasterKey: true });

  const yieldsFormatAnglais = resultats.map((obj) => ({
    currency: obj.get("currency"),
    maturity: obj.get("maturity"),
    yield: obj.get("yieldValue"),
    country: obj.get("country"),
  }));

  return analyserCourbesDeTaux(yieldsFormatAnglais);
}

/**
 * Construit le prompt combinant les 4 sources — désormais toutes
 * précalculées — envoie à Claude Sonnet 5, ET archive les précalculs
 * dans R2 avant l'appel IA (comble l'absence de raw/{date}/cot-analytics.json
 * et raw/{date}/bond-yield-curve.json signalée).
 */
export async function genererSynthese({ periode = "quotidien" } = {}) {
  if (process.env.SYNTHESE_SUSPENDUE === "true") {
    throw new Error("Synthèse suspendue (SYNTHESE_SUSPENDUE=true) — genererSynthese() ne doit pas être appelée.");
  }

  const [banqueCentrale, calendrier, cot, courbeDeTaux] = await Promise.all([
    recupererDonneesBanqueCentrale(),
    recupererDonneesCalendrier(),
    recupererDonneesCOT(),
    recupererDonneesCourbeDeTaux(),
  ]);

  // Archive des précalculs dans R2 avant transmission IA — non bloquant
  try {
    await uploaderVersR2(genererCleDuJour("cot-analytics"), JSON.stringify(cot, null, 2));
    await uploaderVersR2(genererCleDuJour("bond-yield-curve"), JSON.stringify(courbeDeTaux, null, 2));
  } catch (err) {
    console.error("Erreur upload R2 précalculs (non bloquant) :", err.message);
  }

  const prompt = `
Tu es un analyste macro-financier senior spécialisé en fondamental (banques centrales, COT, courbe de taux, calendrier économique).

Rédige une synthèse ${periode} claire et actionnable pour un trader, basée UNIQUEMENT sur les données ci-dessous, déjà précalculées et classifiées. N'invente aucune donnée, aucun chiffre. Si une source est vide ou non pertinente pour une devise, ignore-la sans le signaler explicitement.

## Banque(s) centrale(s) — communiqués du jour
${JSON.stringify(banqueCentrale, null, 2)}

## Calendrier économique — contexte macro consolidé par famille d'indicateurs (surprise vs consensus, publications liées récentes déjà rassemblées)
${JSON.stringify(calendrier, null, 2)}

## COT (Commitment of Traders) — Z-Score, percentile, classification déterministe déjà calculés
${JSON.stringify(cot, null, 2)}

## Courbe de taux — spreads, forme de courbe et cohérence FX déjà calculés
${JSON.stringify(courbeDeTaux, null, 2)}

Structure ta réponse par devise concernée, avec un ton hawkish/dovish/neutre explicite quand les données le permettent, et mentionne les convergences/divergences entre COT et courbe de taux si pertinentes.
`.trim();

  const { text } = await generateText({
    model: MODELE,
    prompt,
  });

  return text;
}

export async function genererSyntheseHebdomadaire(synthesesQuotidiennes) {
  if (process.env.SYNTHESE_SUSPENDUE === "true") {
    throw new Error("Synthèse suspendue (SYNTHESE_SUSPENDUE=true) — genererSyntheseHebdomadaire() ne doit pas être appelée.");
  }

  const contenuSemaine = synthesesQuotidiennes
    .map((s) => `### ${s.date}\n${s.texte}`)
    .join("\n\n");

  const prompt = `
Tu es un analyste macro-financier senior. Voici les synthèses quotidiennes
de la semaine écoulée (du lundi au vendredi). Rédige un résumé hebdomadaire
qui dégage les tendances de fond, les changements de ton (hawkish/dovish)
d'une banque centrale à l'autre au fil de la semaine, et les points clés
à surveiller la semaine suivante. Ne répète pas mécaniquement chaque jour
— synthétise.

${contenuSemaine}
`.trim();

  const { text } = await generateText({
    model: MODELE,
    prompt,
  });

  return text;
}
