// app/api/pipeline/run/route.js
// Déclenché par le bouton du dashboard — exécute tout le pipeline en une
// fois pour TOUS les événements bancaires du jour (pas un seul), sans
// attendre les crons.
import { NextResponse } from "next/server";
import { lireEvenementsDuJour } from "../../../../lib/reconnaissance-service";
import { DEVISE_TO_BANQUE, trouverCategoriePourEvenement } from "../../../../lib/central-bank-keywords";
import { filtrerParagraphes } from "../../../../lib/paragraph-filter-service";
import {
  enregistrerReconnaissance,
  enregistrerDocumentFinal,
  recupererDernierEventConnu,
} from "../../../../lib/central-bank-pipeline-service";

export const maxDuration = 60;

function detecterEvenementsBancaires(evenementsDuJour) {
  const detectes = [];
  const dejaVus = new Set();

  for (const e of evenementsDuJour) {
    const categorie = trouverCategoriePourEvenement(e.evenement);
    if (!categorie) continue;

    const banqueCentrale = DEVISE_TO_BANQUE[e.devise] || null;
    if (!banqueCentrale) continue;

    const cleDedup = `${e.devise}-${categorie}`;
    if (dejaVus.has(cleDedup)) continue;
    dejaVus.add(cleDedup);

    detectes.push({
      devise: e.devise,
      banqueCentrale,
      categorie,
      evenementNom: e.evenement,
      heureEvenement: e.heure,
    });
  }

  return detectes;
}

export async function POST(request) {
  try {
    const evenementsDuJour = await lireEvenementsDuJour();
    const evenementsBancaires = detecterEvenementsBancaires(evenementsDuJour);

    if (evenementsBancaires.length === 0) {
      await enregistrerReconnaissance({
        devise: null, banqueCentrale: null, categorie: null,
        evenementNom: null, heureEvenement: null, scrapeTarget: false,
      });
      return NextResponse.json({ status: "skip", reason: "aucun événement bancaire aujourd'hui" });
    }

    const renderUrl = process.env.RENDER_SCRAPER_URL;
    const renderSecret = process.env.RENDER_SCRAPER_SECRET;
    if (!renderUrl || !renderSecret) {
      throw new Error("RENDER_SCRAPER_URL ou RENDER_SCRAPER_SECRET manquant");
    }

    const resultats = [];

    for (const evt of evenementsBancaires) {
      const entree = await enregistrerReconnaissance({
        devise: evt.devise,
        banqueCentrale: evt.banqueCentrale,
        categorie: evt.categorie,
        evenementNom: evt.evenementNom,
        heureEvenement: evt.heureEvenement,
        scrapeTarget: true,
      });

      try {
        const renderResponse = await fetch(`${renderUrl}/scrape/central-bank-statement`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${renderSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ banque: evt.banqueCentrale, categorie: evt.categorie }),
        });

        if (!renderResponse.ok) {
          throw new Error(`Échec appel Render : HTTP ${renderResponse.status}`);
        }

        const { success, texte, error: renderError } = await renderResponse.json();
        if (!success) {
          throw new Error(renderError || "Le service Render a renvoyé une erreur");
        }

        const phrases = filtrerParagraphes(texte, evt.banqueCentrale);

        if (phrases.length === 0) {
          await enregistrerDocumentFinal(entree.id, []);
          const fallback = await recupererDernierEventConnu(evt.devise);
          resultats.push({
            devise: evt.devise,
            categorie: evt.categorie,
            status: "skip",
            reason: "aucun mot-clé trouvé après scraping",
            dernierEventConnu: fallback ? fallback.get("documentFinal") : null,
          });
          continue;
        }

        const saved = await enregistrerDocumentFinal(entree.id, phrases);
        resultats.push({
          devise: evt.devise,
          categorie: evt.categorie,
          status: "ok",
          documentFinal: saved.get("documentFinal"),
        });
      } catch (error) {
        console.error(`Erreur scraping ${evt.banqueCentrale}/${evt.categorie} :`, error);
        resultats.push({ devise: evt.devise, categorie: evt.categorie, status: "error", message: error.message });
      }
    }

    return NextResponse.json({ status: "ok", resultats });
  } catch (error) {
    console.error("Erreur pipeline manuel :", error);
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
