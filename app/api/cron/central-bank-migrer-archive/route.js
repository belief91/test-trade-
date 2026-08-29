// app/api/cron/central-bank-migrer-archive/route.js
//
// Route de migration/rejeu (29/08) — répond au "problème majeur" : le
// pipeline banque centrale ne peut être validé qu'en attendant un vrai
// événement, rare et imprévisible. Cette route reconstruit l'archive R2
// par devise à partir de TOUT ce qui est déjà "done" dans Back4App,
// sans re-scraper. Idempotente, rejouable à tout moment.
//
// FIX QUALITÉ (29/08) : première version migrait aveuglément toute
// entrée "done", sans vérifier la qualité du contenu. Confirmé en
// production : l'entrée "fomc minutes" du 19/08 n'a qu'UNE phrase — la
// mention légale de fin de document ("The descriptions of economic and
// financial conditions...ˮ), pas le contenu réel. Cause identifiée :
// cette entrée a été scrapée le 19/08, DEUX JOURS AVANT le fix du 21/08
// ("minutes FOMC suit le vrai lien du document au lieu du communiqué
// d'annonce") — un bug déjà corrigé, mais dont le résultat pourri est
// resté figé "done" dans Back4App depuis, jamais retraité.
//
// Cette route ne re-scrape rien (par design), donc elle ne peut pas
// corriger le contenu lui-même — mais elle peut au moins refuser de
// propager un résultat manifestement insuffisant vers l'archive R2.
// Seuil : au moins 3 phrases retenues (le même ordre de grandeur que
// les cas valides observés : 57 phrases pour un discours, plusieurs
// dizaines pour un vrai document de minutes). Une entrée sous ce seuil
// est ignorée et listée séparément dans la réponse, pour rester visible
// au lieu de disparaître silencieusement.
const SEUIL_MIN_PHRASES = 3;

export async function GET() {
  const { recupererTousLesEvenementsDone } = await import("../../../../lib/central-bank-pipeline-service");
  const { mettreAJourFichierDevise } = await import("../../../../lib/central-bank-archive-r2");
  const { NextResponse } = await import("next/server");

  try {
    const entrees = await recupererTousLesEvenementsDone();

    const parDevise = {};
    const ignorees = [];

    for (const entree of entrees) {
      const devise = entree.get("deviseDetectee");
      if (!devise) continue;

      const documentFinal = entree.get("documentFinal") || [];

      if (documentFinal.length < SEUIL_MIN_PHRASES) {
        ignorees.push({
          devise,
          categorie: entree.get("categorie"),
          dateTexte: entree.get("dateTexte"),
          nombrePhrases: documentFinal.length,
          raison: `moins de ${SEUIL_MIN_PHRASES} phrases — probablement un résultat de scraping incomplet (ex: mention légale au lieu du document réel), pas migré`,
        });
        continue;
      }

      const dateISO = new Date(entree.get("date")).toISOString().split("T")[0];

      await mettreAJourFichierDevise(devise, {
        date: dateISO,
        banqueCentrale: entree.get("banqueCentrale"),
        categorie: entree.get("categorie"),
        status: "ok",
        documentFinal,
      });

      parDevise[devise] = (parDevise[devise] || 0) + 1;
    }

    return NextResponse.json({
      status: "ok",
      totalEntreesDone: entrees.length,
      migreesParDevise: parDevise,
      ignorees,
    });
  } catch (error) {
    console.error("Erreur migration archive banque centrale :", error);
    return Response.json({ status: "error", message: error.message }, { status: 500 });
  }
}
