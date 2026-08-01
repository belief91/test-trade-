// lib/ai-synthesis-service.js
import { generateText } from "ai";
import Parse from "./back4app-server";
import { fetchCOT } from "./cot-tff-service";

const MODELE = "anthropic/claude-sonnet-5";

/**
 * Récupère tous les documents Banque Centrale du jour (statutScraping="done").
 */
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
 * Récupère les événements du calendrier économique (fenêtre complète
 * disponible — la classe est rafraîchie chaque semaine, pas d'historique
 * à filtrer par date ici).
 */
async function recupererDonneesCalendrier() {
  const CentralBankCalendar = Parse.Object.extend("CentralBankCalendar");
  const query = new Parse.Query(CentralBankCalendar);
  query.limit(1000);

  const resultats = await query.find({ useMasterKey: true });

  return resultats.map((obj) => ({
    date: obj.get("date"),
    heure: obj.get("heureGmt3"),
    devise: obj.get("devise"),
    evenement: obj.get("evenement"),
    reel: obj.get("reel"),
    precedent: obj.get("precedent"),
    consensus: obj.get("consensus"),
    prevision: obj.get("prevision"),
  }));
}

/**
 * Récupère les données COT (Commitment of Traders) — fetchCOT() ne prend
 * aucun paramètre, elle boucle déjà en interne sur toutes les devises
 * définies dans MARCHES (lib/cot-tff-service.js).
 */
async function recupererDonneesCOT() {
  return await fetchCOT();
}

/**
 * Récupère les rendements obligataires bruts (2Y/5Y/10Y, G10) tels
 * qu'importés de TradingEconomics, sans calcul d'écart (pas encore
 * construit côté BELIEFX).
 */
async function recupererDonneesCourbeDeTaux() {
  const BondYieldMaturity = Parse.Object.extend("BondYieldMaturity");
  const query = new Parse.Query(BondYieldMaturity);
  query.limit(1000);

  const resultats = await query.find({ useMasterKey: true });

  return resultats.map((obj) => ({
    devise: obj.get("currency"),
    maturite: obj.get("maturity"),
    pays: obj.get("country"),
    rendement: obj.get("yieldValue"),
    variationJour: obj.get("dayChgPercent"),
    variationMois: obj.get("monthChgPercent"),
    variationAnnee: obj.get("yearChgPercent"),
    date: obj.get("dateLabel"),
  }));
}

/**
 * Construit le prompt combinant les 4 sources, envoie à Claude Sonnet 5
 * via Vercel AI Gateway, retourne le texte de synthèse.
 */
export async function genererSynthese({ periode = "quotidien" } = {}) {
  const [banqueCentrale, calendrier, cot, courbeDeTaux] = await Promise.all([
    recupererDonneesBanqueCentrale(),
    recupererDonneesCalendrier(),
    recupererDonneesCOT(),
    recupererDonneesCourbeDeTaux(),
  ]);

  const prompt = `
Tu es un analyste macro-financier senior spécialisé en fondamental (banques centrales, COT, courbe de taux, calendrier économique).

Rédige une synthèse ${periode} claire et actionnable pour un trader, basée UNIQUEMENT sur les données ci-dessous. N'invente aucune donnée. Si une source est vide ou non pertinente pour une devise, ignore-la sans le signaler explicitement.

## Banque(s) centrale(s) — communiqués du jour
${JSON.stringify(banqueCentrale, null, 2)}

## Calendrier économique
${JSON.stringify(calendrier, null, 2)}

## COT (Commitment of Traders) — positionnement Asset Managers / Leveraged Funds
${JSON.stringify(cot, null, 2)}

## Courbe de taux — rendements obligataires bruts (2Y/5Y/10Y, G10)
${JSON.stringify(courbeDeTaux, null, 2)}

Structure ta réponse par devise concernée, avec un ton hawkish/dovish/neutre explicite quand les données le permettent, et mentionne les convergences/divergences entre COT et courbe de taux si pertinentes.
`.trim();

  const { text } = await generateText({
    model: MODELE,
    prompt,
  });

  return text;
}

/**
 * Résumé hebdomadaire (samedi) — agrège les synthèses quotidiennes de
 * la semaine (Lun-Ven), sans re-fetcher les 4 sources brutes.
 */
export async function genererSyntheseHebdomadaire(synthesesQuotidiennes) {
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
