// app/api/cron/bc-state/route.js
//
// Automatise l'etat BC de PRODUCTION :
//
//   bc_documents (alimente par /api/cron/bc-flux) -> bc_reference ->
//   analyse IA (seulement s'il y a un document jamais analyse) -> bc_state
//
// bc_state est ensuite lu par la synthese quotidienne (BC) via
// lib/bc-state/bc-contexte.js. La logique d'analyse vit dans
// lib/bc-state/bc-analyse.js (partagee avec scripts/test-bc-state-fed.js).
//
// PERIMETRE : Fed. Une banque de plus = une entree dans BANQUES, une fois son
// flux (/api/cron/bc-flux) en place.
//
// Cout IA : l'IA n'est appelee que si bc_daily_package trouve au moins un
// document jamais analyse (ou une nouvelle reference). Un passage sans
// nouveaute ne coute que quelques lectures R2.
//
// Garde-fous : SYNTHESE_SUSPENDUE=true coupe l'appel IA (la reference,
// gratuite, continue). Modele : BC_STATE_MODELE (variable Vercel
// optionnelle) ; defaut stepfun/step-3.7-flash.
//
// ALERTE : HTTP 500 si une banque est en ERREUR technique (R2, Render, IA,
// reponse invalide) - le job GitHub Actions echoue et GitHub previent par
// e-mail. Un ECHEC_VERIFICATION (preuves rejetees) n'est pas une panne : 200,
// l'analyse sera retentee au passage suivant.

import { NextResponse } from "next/server";
import { construireBcReference } from "../../../../lib/bc-state/bc-reference";
import { analyserBc, MODELE_TEST_PAR_DEFAUT } from "../../../../lib/bc-state/bc-analyse";

export const maxDuration = 120;

const BANQUES = ["Fed"];

export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const modele = process.env.BC_STATE_MODELE || MODELE_TEST_PAR_DEFAUT;
  const suspendu = process.env.SYNTHESE_SUSPENDUE === "true";
  const resultats = {};

  for (const banque of BANQUES) {
    try {
      const reference = await construireBcReference(banque);
      const rapport = { referenceDate: reference.referenceDate };

      if (suspendu) {
        rapport.analyse = { statut: "SUSPENDU", raison: "SYNTHESE_SUSPENDUE=true" };
      } else {
        const analyse = await analyserBc(banque, { modele });
        rapport.analyse = {
          statut: analyse.statut,
          verification: analyse.verification || null,
          echecs: analyse.statut === "ECHEC_VERIFICATION" ? analyse.echecs : undefined,
          usage: analyse.usage || null,
        };
      }

      resultats[banque] = rapport;
    } catch (error) {
      console.error(`[bc-state] ${banque} :`, error);
      resultats[banque] = { statut: "ERREUR", message: error.message };
    }
  }

  const enErreur = Object.values(resultats).some((r) => r.statut === "ERREUR");

  return NextResponse.json(
    { status: enErreur ? "erreur" : "ok", modele, resultats },
    { status: enErreur ? 500 : 200 }
  );
}
