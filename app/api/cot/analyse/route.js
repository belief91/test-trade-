// app/api/cot/analyse/route.js
// Chaîne 100% automatique pour les 7 devises :
// 1. Trouve et lit le dernier cot.json sur R2
// 2. Pour chaque devise : calcule Z-Score/percentile/deltas, puis classe selon les règles fixes
// 3. Envoie les chiffres déjà calculés à l'API Anthropic (narratif ACTION + CONFIANCE uniquement)
// 4. Sauvegarde le résultat combiné sur R2 dans raw/{date}/cot-analyse.json
//    (même convention que tes autres modules, prêt pour ton étape de fusion)

import { trouverDernierFichierCOT, lireJSONDepuisR2, ecrireJSONDansR2, genererCleDuJour } from "../../../../lib/r2-client";
import { analyserDevise } from "../../../../lib/cot-analytics";
import { classifierCOT } from "../../../../lib/cot-classification";

function construirePrompt(classification, vueMacro) {
  const c = classification;
  const vueMacroTexte = vueMacro || "Non fournie";
  return `═══════════════════════════════════════════════════════════
RÔLE : Analyste Quantitatif Senior - Positionnement COT
═══════════════════════════════════════════════════════════

Spécialisé flux institutionnels COT/CFTC. ZÉRO hallucination :
tous les chiffres ci-dessous sont déjà calculés en amont par un
script déterministe (Z-Score, percentile, deltas, phase, divergence).
Tu ne dois RIEN recalculer, seulement interpréter et rédiger.

PRINCIPE : "Suis la foule au début (Z<1.5), fuis-la à la fin (Z>2.5)"

RAPPEL HIÉRARCHIE (pour ton interprétation uniquement) :
Dealers (signal contrarien) > Asset Managers (direction) > Leveraged Funds (confirmation)

═══════════════════════════════════════════════════════════

📊 INPUT (déjà calculé, ne pas recalculer) :

Devise : ${c.devise}
Date : ${c.reportDate}

Positionnement : Net D=${c.positionnement.netD} / Net AM=${c.positionnement.netAM} / Net LF=${c.positionnement.netLF} / Net Total=${c.positionnement.netTotal}

Signal Dealer : ${c.signalDealer.lecture} → ${c.signalDealer.confirmation}

Long terme :
  Z-Score D=${c.longTerme.zScoreD} (${c.longTerme.classifD}) | AM=${c.longTerme.zScoreAM} (${c.longTerme.classifAM})
  LF=${c.longTerme.zScoreLF} (${c.longTerme.classifLF}) | Total=${c.longTerme.zScoreTotal} (${c.longTerme.classifTotal})
  Percentile Total : ${c.longTerme.percentileTotal}e

Court terme : ${c.courtTerme.note ? c.courtTerme.note : `Δ4S=${c.courtTerme.delta4S}% | Δ13S=${c.courtTerme.delta13S}%`}

Divergence AM/LF : ${c.divergenceAmLf.type} → ${c.divergenceAmLf.recommandation}

Décision pré-calculée :
  Phase=${c.decision.phase} | Stratégie=${c.decision.strategie} | Sizing=${c.decision.sizing}
  Biais=${c.decision.biais} | Invalidation=${c.decision.invalidation}

Vue macro utilisateur : ${vueMacroTexte}
(si "Non fournie" : ignore ce critère dans justificationConfiance, ne le mentionne pas comme un manque)

═══════════════════════════════════════════════════════════

📤 OUTPUT — Réponds UNIQUEMENT en JSON strict, exactement ces 3 champs,
sans texte autour, sans balises markdown (pas de \`\`\`) :

{
  "action": "Description précise de l'action, citant D/AM/LF + Z-Score (1-2 phrases max)",
  "confiance": "Faible / Moyen / Élevé",
  "justificationConfiance": "Deux phrase, tenant compte de la cohérence signal Dealer / phase / vue macro (si fournie)"
}

═══════════════════════════════════════════════════════════`;
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

    // 1. Trouve et lit automatiquement le dernier fichier historique sur R2
    const cleSource = await trouverDernierFichierCOT();
    const parDevise = await lireJSONDepuisR2(cleSource);

    // 2-3. Traite les 7 devises (séquentiellement pour respecter les limites de rate Anthropic)
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
      source: cleSource,
      devises: resultatParDevise
    };

    // 4. Sauvegarde sur R2, même convention que les autres modules
    const cleDestination = genererCleDuJour("cot-analyse");
    await ecrireJSONDansR2(cleDestination, resultatFinal);

    return Response.json({ savedTo: cleDestination, ...resultatFinal });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
