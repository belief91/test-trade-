// app/api/cot/analyse/route.js
//
// FIX : remplace trouverDernierFichierCOT() + lireJSONDepuisR2(), qui
// cherchait un fichier raw/{date}/cot.json que plus rien n'écrit depuis
// qu'on a retiré cette étape de app/api/cot/route.js. Ce bouton était
// donc cassé depuis le début de nos échanges, jamais signalé jusqu'ici.
//
// Remplacé par fetchHistoriqueCOT(), la même source que la route
// mécanique /api/cot/analysis — historique dédié déjà alimenté chaque
// vendredi par cot-historique-r2.js, fiable et confirmé fonctionnel.
//
// Le reste (prompt, appel Anthropic, structure de sortie) reste
// entièrement inchangé — c'est ton contenu métier, je ne l'ai pas touché.

import { fetchHistoriqueCOT } from "../../../../lib/cot-historique-r2";
import { ecrireJSONDansR2, genererCleDuJour } from "../../../../lib/r2-client";
import { analyserDevise } from "../../../../lib/cot-analytics";
import { classifierCOT } from "../../../../lib/cot-classification";

function construirePrompt(classification, vueMacro) {
  const c = classification;
  return `Tu es un Analyste Quantitatif Senior spécialisé en positionnement COT/CFTC.
ZÉRO hallucination : n'invente aucun chiffre, utilise UNIQUEMENT les données ci-dessous, déjà calculées.

DEVISE : ${c.devise}
DATE DU RAPPORT : ${c.reportDate}

POSITIONNEMENT :
Net Dealer : ${c.positionnement.netD}
Net Asset Managers : ${c.positionnement.netAM}
Net Leveraged Funds : ${c.positionnement.netLF}
Net Total (AM+LF) : ${c.positionnement.netTotal}

SIGNAL DEALER (déjà interprété) :
${c.signalDealer.lecture}
Confirmation : ${c.signalDealer.confirmation}

LONG TERME (déjà calculé) :
Z-Score Dealer : ${c.longTerme.zScoreD} (${c.longTerme.classifD})
Z-Score Asset Managers : ${c.longTerme.zScoreAM} (${c.longTerme.classifAM})
Z-Score Leveraged Funds : ${c.longTerme.zScoreLF} (${c.longTerme.classifLF})
Z-Score Total : ${c.longTerme.zScoreTotal} (${c.longTerme.classifTotal})
Percentile Total : ${c.longTerme.percentileTotal}e

COURT TERME (déjà calculé) :
${c.courtTerme.note ? c.courtTerme.note : `Δ4S : ${c.courtTerme.delta4S}% | Δ13S : ${c.courtTerme.delta13S}%`}

DIVERGENCE AM/LF (déjà classée) :
${c.divergenceAmLf.type} → ${c.divergenceAmLf.recommandation}

DÉCISION (déjà calculée par les règles fixes) :
Phase : ${c.decision.phase}
Stratégie : ${c.decision.strategie}
Sizing : ${c.decision.sizing}
Biais : ${c.decision.biais}
Invalidation : ${c.decision.invalidation}

VUE MACRO DE L'UTILISATEUR : ${vueMacro || "Non fournie"}

TA SEULE TÂCHE : rédige uniquement les deux champs suivants, sans recalculer aucun chiffre ci-dessus :
1. ACTION : description précise de l'action à prendre, citant D/AM/LF + Z-Score
2. CONFIANCE : Faible / Moyen / Élevé, avec une justification d'une phrase

Réponds UNIQUEMENT en JSON strict, sans texte autour, sans balises markdown :
{"action": "...", "confiance": "...", "justificationConfiance": "..."}`;
}

async function appellerAnthropic(prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const erreurTexte = await response.text();
    throw new Error(`Erreur API Anthropic: ${response.status} ${erreurTexte}`);
  }

  const data = await response.json();
  const texteBrut = data.content.find(bloc => bloc.type === "text")?.text || "{}";
  const texteNettoye = texteBrut.replace(/```json|```/g, "").trim();
  return JSON.parse(texteNettoye);
}

async function analyserUneDevise(devise, historiqueDevise, vueMacro) {
  const analyse = analyserDevise(historiqueDevise);
  analyse.devise = devise;
  const classification = classifierCOT(analyse);

  let narratif = { note: "Clé ANTHROPIC_API_KEY non configurée — narratif non généré, classification disponible" };
  if (process.env.ANTHROPIC_API_KEY) {
    const prompt = construirePrompt(classification, vueMacro);
    narratif = await appellerAnthropic(prompt);
  }

  return { classification, narratif };
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const vueMacroParDevise = body.vueMacroParDevise || {};

    // FIX : source de données remplacée — historique dédié au lieu du
    // fichier raw/{date}/cot.json inexistant
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - 110 * 7);
    const dateDebutStr = dateDebut.toISOString().split("T")[0];
    const parDevise = await fetchHistoriqueCOT(dateDebutStr);

    const devises = Object.keys(parDevise);
    const resultatParDevise = {};
    for (const devise of devises) {
      resultatParDevise[devise] = await analyserUneDevise(
        devise,
        parDevise[devise],
        vueMacroParDevise[devise]
      );
    }

    const resultatFinal = {
      generatedAt: new Date().toISOString(),
      source: "fetchHistoriqueCOT (historique dédié)",
      devises: resultatParDevise
    };

    const cleDestination = genererCleDuJour("cot-analyse");
    await ecrireJSONDansR2(cleDestination, resultatFinal);

    return Response.json({ savedTo: cleDestination, ...resultatFinal });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
