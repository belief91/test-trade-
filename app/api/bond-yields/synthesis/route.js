// app/api/bond-yields/synthesis/route.js
// FIX : ajout de force-dynamic / fetchCache. Sans ça, cette route risquait
// le même bug que /api/cot : cette route lit un fichier R2 qui change
// chaque jour (bond-yield-analysis.json du jour), donc elle DOIT être
// réévaluée à chaque requête, pas figée au build.
//
// Chaîne 100% automatique pour les 8 devises G10 :
// 1. Lit bond-yield-analysis.json du jour depuis R2 (déjà pré-calculé)
// 2. Pour chaque devise : injecte les spreads/forme/cohérence dans le prompt
// 3. Envoie à l'API Anthropic (narratif + BIAIS TAUX + VALIDATION uniquement)
// 4. Sauvegarde le résultat sur R2 dans raw/{date}/bond-yield-synthesis.json

import { lireJSONDepuisR2, ecrireJSONDansR2, genererCleDuJour } from "../../../../lib/r2-client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Construit le prompt pour UNE devise, avec les chiffres déjà calculés par
// bond-yield-curve-analysis.js — l'IA ne calcule rien, elle rédige uniquement.
function construirePrompt(resultatDevise) {
  const r = resultatDevise;
  const USD = r.devise === "USD";

  return `Tu es un Stratège Taux & Obligations.
ZÉRO hallucination : n'invente aucun chiffre, utilise UNIQUEMENT les données ci-dessous, déjà calculées.
ZÉRO référence aux banques centrales ou politique monétaire.

DEVISE : ${r.devise} (${r.pays})
DATE : ${new Date().toISOString().slice(0, 10)}

DONNÉES PRÉ-CALCULÉES :
Yield 2Y  : ${r.yield2Y !== null ? r.yield2Y.toFixed(3) + "%" : "MANQUANT"}
Yield 10Y : ${r.yield10Y !== null ? r.yield10Y.toFixed(3) + "%" : "MANQUANT"}
Spread courbe (10Y - 2Y) : ${r.spreadCourbe !== null ? (r.spreadCourbe > 0 ? "+" : "") + r.spreadCourbe.toFixed(3) : "N/A"}
Forme de courbe : ${r.formeCourbe}

${!USD && r.spreadFX10Y !== null ? `SPREADS FX vs USD (déjà calculés) :
Spread 10Y (USD10Y - ${r.devise}10Y) : ${r.spreadFX10Y > 0 ? "+" : ""}${r.spreadFX10Y.toFixed(3)} → flux vers ${r.directionFX10Y}
Spread 2Y  (USD2Y  - ${r.devise}2Y)  : ${r.spreadFX2Y > 0 ? "+" : ""}${r.spreadFX2Y.toFixed(3)} → flux vers ${r.directionFX2Y}
Cohérence 2Y/10Y : ${r.coherenceFX}` : USD ? "SPREADS FX : USD est la devise de référence — pas de spread vs USD calculé." : "SPREADS FX : données insuffisantes."}

TA SEULE TÂCHE : rédige uniquement les champs suivants, sans recalculer aucun chiffre ci-dessus :
1. NARRATIF phrase 1 : spreads + direction des flux + chiffres (si USD : forme de courbe + structure de taux uniquement)
2. NARRATIF phrase 2 : forme de courbe + ce qu'elle révèle sur la structure économique
   → Zéro répétition, zéro blabla, chaque mot doit peser, maximum 30 mots par phrase
3. BIAIS_TAUX : exactement un de ces mots → Haussier / Baissier / Mixte / Provisoire
4. VALIDATION : exactement un de ces mots → CONFIRME / DIVERGENCE / PARTIELLE

Réponds UNIQUEMENT en JSON strict, sans texte autour, sans balises markdown :
{"narratif1": "...", "narratif2": "...", "biais_taux": "...", "validation": "..."}`;
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
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const erreurTexte = await response.text();
    throw new Error(`Erreur API Anthropic: ${response.status} ${erreurTexte}`);
  }

  const data = await response.json();
  const texteBrut = data.content.find((bloc) => bloc.type === "text")?.text || "{}";
  const texteNettoye = texteBrut.replace(/```json|```/g, "").trim();
  return JSON.parse(texteNettoye);
}

async function analyserUneDevise(resultatDevise) {
  let narratif = {
    note: "Clé ANTHROPIC_API_KEY non configurée — narratif non généré, calculs disponibles",
  };

  if (process.env.ANTHROPIC_API_KEY) {
    const prompt = construirePrompt(resultatDevise);
    narratif = await appellerAnthropic(prompt);
  }

  return {
    devise: resultatDevise.devise,
    pays: resultatDevise.pays,
    calculs: {
      yield2Y: resultatDevise.yield2Y,
      yield10Y: resultatDevise.yield10Y,
      spreadCourbe: resultatDevise.spreadCourbe,
      formeCourbe: resultatDevise.formeCourbe,
      spreadFX10Y: resultatDevise.spreadFX10Y,
      spreadFX2Y: resultatDevise.spreadFX2Y,
      directionFX10Y: resultatDevise.directionFX10Y,
      directionFX2Y: resultatDevise.directionFX2Y,
      coherenceFX: resultatDevise.coherenceFX,
    },
    narratif,
  };
}

export async function GET() {
  try {
    // 1. Lit bond-yield-analysis.json du jour depuis R2
    const cleSource = genererCleDuJour("bond-yield-analysis");
    let analyse;
    try {
      analyse = await lireJSONDepuisR2(cleSource);
    } catch {
      return Response.json(
        {
          error: `Fichier R2 introuvable : ${cleSource} — lance d'abord /api/bond-yields/analysis pour générer l'analyse du jour.`,
        },
        { status: 400 }
      );
    }

    const resultats = analyse.resultats || [];
    if (resultats.length === 0) {
      return Response.json(
        { error: "Aucun résultat dans bond-yield-analysis.json — données vides." },
        { status: 400 }
      );
    }

    // 2-3. Traite chaque devise séquentiellement (respecte les limites de rate Anthropic)
    const syntheses = [];
    for (const resultatDevise of resultats) {
      const synthese = await analyserUneDevise(resultatDevise);
      syntheses.push(synthese);
    }

    // Tableau récapitulatif (SYNTHÈSE FINALE du prompt)
    const tableauRecap = syntheses.map((s) => ({
      devise: s.devise,
      courbe: s.calculs.formeCourbe,
      biais_taux: s.narratif.biais_taux || "—",
      validation_fx: s.narratif.validation || "—",
    }));

    // Alertes : signale les DIVERGENCE ou PARTIELLE
    const alertes = syntheses
      .filter((s) => ["DIVERGENCE", "PARTIELLE"].includes(s.narratif.validation))
      .map((s) => ({
        devise: s.devise,
        validation: s.narratif.validation,
        biais_taux: s.narratif.biais_taux,
      }));

    const resultatFinal = {
      generatedAt: new Date().toISOString(),
      source: cleSource,
      syntheses,
      tableauRecap,
      alertes,
      devisesIgnorees: analyse.devisesIgnorees || [],
    };

    // 4. Sauvegarde sur R2, même convention que les autres modules
    const cleDestination = genererCleDuJour("bond-yield-synthesis");
    await ecrireJSONDansR2(cleDestination, resultatFinal);

    return Response.json({ savedTo: cleDestination, ...resultatFinal });
  } catch (err) {
    console.error("Erreur synthèse bond yields :", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
