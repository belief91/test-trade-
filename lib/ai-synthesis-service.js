// lib/ai-synthesis-service.js
//
// FIX MAJEUR (anterieur) : cot-analytics/bond-yield-curve precalcules et
// branches, plutot que recalcules a la volee.
//
// FIX VOLUME #2 (27/08) : raw/{date}/calendrier-consolide.json a change
// de forme cote ecriture (app/api/central-bank-calendar/route.js) pour
// eliminer la duplication du contexte macro entre evenements soeurs du
// meme jour (ex: le bloc "employment" etait recopie identique jusqu'a 5
// fois). Nouvelle forme : { generatedAt, count, contextePartage, data }
// ou contextePartage[famille][devise] = liste, calculee une seule fois,
// et chaque entree de data ne porte qu'un tableau de NOMS de familles
// liees ("famillesLiees"), a resoudre contre contextePartage.
//
// recupererDonneesCalendrier() lit desormais le fichier ENTIER (plus
// seulement .data) et reconstruit, pour le prompt IA, un objet ou chaque
// evenement porte son contexte resolu -- l'IA recoit un contenu
// EQUIVALENT a avant (chaque evenement voit toujours son contexte par
// famille), mais le fichier stocke sur R2 ne duplique plus rien. La
// resolution (jointure familles -> evenements) se fait ici, en memoire,
// pas de duplication sur disque.

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
 * FIX VOLUME #2 (27/08) : lit desormais le fichier consolide EN ENTIER
 * (contextePartage + data), puis resout chaque evenement contre le
 * contexte partage correspondant a sa/ses famille(s) liee(s) + sa
 * devise. Retourne un tableau equivalent a l'ancienne forme (chaque
 * evenement porte son "contexte" complet par famille), pour que le
 * prompt IA ci-dessous n'ait rien a changer -- seule la representation
 * SUR R2 a change, pas ce que voit le modele.
 *
 * Degradation propre : si contextePartage est absent (ancien format
 * encore en cache, ou fichier du jour pas encore genere), retombe sur
 * les evenements tels quels sans contexte resolu plutot que de planter.
 */
async function recupererDonneesCalendrier() {
  const cle = genererCleDuJour("calendrier-consolide");
  try {
    const resultat = await lireJSONDepuisR2(cle);
    const contextePartage = resultat.contextePartage || {};
    const evenements = resultat.data || [];

    return evenements.map((e) => {
      const contexte = {};
      for (const familleLiee of e.famillesLiees || []) {
        const parDevise = contextePartage[familleLiee] || {};
        contexte[familleLiee] = parDevise[e.devise] || [];
      }
      return {
        eventId: e.eventId,
        devise: e.devise,
        publicationDuJour: e.publicationDuJour,
        contexte,
      };
    });
  } catch (err) {
    console.error(`Erreur lecture calendrier consolidé (${cle}) :`, err.message);
    return [];
  }
}

async function recupererDonneesCOT() {
  const cle = genererCleDuJour("cot-precalcul");
  try {
    return await lireJSONDepuisR2(cle);
  } catch (err) {
    console.error(`Erreur lecture COT précalculé (${cle}) :`, err.message);
    return {};
  }
}

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

  try {
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
