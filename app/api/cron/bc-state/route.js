// app/api/cron/bc-state/route.js
//
// Automatise l'etat BC : plus besoin de lancer les scripts a la main.
//
//   ingestion du flux -> bc_documents -> bc_reference -> analyse IA
//   (seulement s'il y a un document jamais analyse) -> bc_state
//
// La logique d'analyse vit dans lib/bc-state/bc-analyse.js (partagee
// avec le script manuel). Cette route ne fait qu'enchainer les etapes.
//
// PERIMETRE : Fed uniquement pour l'instant (prototype valide avant
// generalisation). Pour la Fed, la source est le fichier du scraping
// continu test/central-bank-fed.json (ecrit par app/api/test/central-bank-fed,
// 4x/jour). Une banque de plus = une entree dans BANQUES, une fois son
// flux de scraping continu en place.
//
// Cout IA : l'IA n'est appelee que si bc_daily_package trouve au moins un
// document jamais analyse (ou une nouvelle reference). Un passage sans
// nouveaute ne coute que quelques lectures R2.
//
// Garde-fous : memes que la synthese quotidienne. SYNTHESE_SUSPENDUE=true
// coupe l'appel IA (l'ingestion et la reference, gratuites, continuent).
// Modele : BC_STATE_MODELE (variable Vercel optionnelle) ; par defaut le
// modele de test economique. Passer a anthropic/claude-sonnet-5 = definir
// cette variable, aucun code a changer.

import { NextResponse } from "next/server";
import { ingurgiterDepuisFichierTest } from "../../../../lib/bc-state/bc-documents";
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
      const ingestion = await ingurgiterDepuisFichierTest(banque);
      const reference = await construireBcReference(banque);

      const rapport = {
        ingestion: {
          nouveauxDocuments: ingestion.nouveaux,
          totalBcDocuments: ingestion.totalApresDedup,
        },
        referenceDate: reference.referenceDate,
      };

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

  return NextResponse.json({ status: "ok", modele, resultats });
}
