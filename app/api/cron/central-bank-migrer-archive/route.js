// app/api/cron/central-bank-migrer-archive/route.js
//
// Route de migration/rejeu (29/08) — répond au "problème majeur" : le
// pipeline banque centrale ne peut être validé qu'en attendant un vrai
// événement, rare et imprévisible. Quand un vrai événement arrive et
// qu'un bug empêche l'archivage (ex: AUD "rba meeting minutes" du
// 25/08, USD "fed chair warsh speech" du 28/08 — tous deux correctement
// scrapés et marqués "done" dans Back4App, mais jamais écrits dans
// database/banque-centrale/{devise}.json à l'époque, pour des raisons
// différentes déjà corrigées depuis), il n'y avait aucun moyen de les
// récupérer sans attendre le PROCHAIN événement inconnu.
//
// Cette route reconstruit l'archive R2 par devise à partir de TOUT ce
// qui est déjà "done" dans Back4App, sans re-scraper (contenu déjà
// validé). Peut être appelée à tout moment, autant de fois que
// nécessaire — idempotente (mettreAJourFichierDevise dédoublonne par
// date+categorie).
//
// GET /api/cron/central-bank-migrer-archive
export async function GET() {
  const { recupererTousLesEvenementsDone } = await import("../../../../lib/central-bank-pipeline-service");
  const { mettreAJourFichierDevise } = await import("../../../../lib/central-bank-archive-r2");
  const { NextResponse } = await import("next/server");

  try {
    const entrees = await recupererTousLesEvenementsDone();

    const parDevise = {};

    for (const entree of entrees) {
      const devise = entree.get("deviseDetectee");
      if (!devise) continue;

      const documentFinal = entree.get("documentFinal") || [];
      if (documentFinal.length === 0) continue;

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
    });
  } catch (error) {
    console.error("Erreur migration archive banque centrale :", error);
    return Response.json({ status: "error", message: error.message }, { status: 500 });
  }
}
