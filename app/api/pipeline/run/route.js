// app/api/pipeline/run/route.js
// Déclenché par le bouton du dashboard — exécute tout le pipeline en une fois,
// sans attendre les crons. Même logique que reconnaissance + central-bank-scrape,
// fusionnée en un seul appel synchrone.
import { NextResponse } from "next/server";
import { lireEvenementsDuJour, contientMotCleEvenement } from "../../../../lib/reconnaissance-service";
import { DEVISE_TO_BANQUE } from "../../../../lib/central-bank-keywords";
import { filtrerParagraphes } from "../../../../lib/paragraph-filter-service";
import {
  enregistrerReconnaissance,
  enregistrerDocumentFinal,
  recupererDernierEventConnu,
} from "../../../../lib/central-bank-pipeline-service";

export const maxDuration = 60;

export async function POST(request) {
  try {
    // Étape 1-2 : lecture calendrier (Back4App) + filtre devise
    const evenementsDuJour = await lireEvenementsDuJour();
    const evenementBancaire = evenementsDuJour.find((e) => contientMotCleEvenement(e.evenement));

    if (!evenementBancaire) {
      await enregistrerReconnaissance({
        devise: null, banqueCentrale: null, evenementNom: null,
        heureEvenement: null, scrapeTarget: false,
      });
      return NextResponse.json({ status: "skip", reason: "aucun événement bancaire aujourd'hui" });
    }

    const devise = evenementBancaire.devise;
    const banqueCentrale = DEVISE_TO_BANQUE[devise] || null;

    const entree = await enregistrerReconnaissance({
      devise, banqueCentrale,
      evenementNom: evenementBancaire.evenement,
      heureEvenement: evenementBancaire.heure,
      scrapeTarget: true,
    });

    // Étape 3 : scrape ciblé via Render (bloque les 9 autres BC)
    const renderUrl = process.env.RENDER_SCRAPER_URL;
    const renderSecret = process.env.RENDER_SCRAPER_SECRET;

    if (!renderUrl || !renderSecret) {
      throw new Error("RENDER_SCRAPER_URL ou RENDER_SCRAPER_SECRET manquant");
    }

    const renderResponse = await fetch(`${renderUrl}/scrape/central-bank-statement`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${renderSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ banque: banqueCentrale }),
    });

    if (!renderResponse.ok) {
      throw new Error(`Échec de l'appel au service Render : HTTP ${renderResponse.status}`);
    }

    const { success, texte, error: renderError } = await renderResponse.json();
    if (!success) {
      throw new Error(renderError || "Le service Render a renvoyé une erreur");
    }

    // Étape 4 : filtre mots-clés
    const paragraphes = filtrerParagraphes(texte, banqueCentrale);

    if (paragraphes.length === 0) {
      await enregistrerDocumentFinal(entree.id, []);
      const fallback = await recupererDernierEventConnu(devise);
      return NextResponse.json({
        status: "skip",
        reason: "aucun mot-clé trouvé après scraping",
        dernierEventConnu: fallback ? fallback.get("documentFinal") : null,
      });
    }

    // Étape 5 : document final
    const saved = await enregistrerDocumentFinal(entree.id, paragraphes);
    return NextResponse.json({ status: "ok", documentFinal: saved.get("documentFinal") });
  } catch (error) {
    console.error("Erreur pipeline manuel :", error);
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
