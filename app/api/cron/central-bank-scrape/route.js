// app/api/cron/central-bank-scrape/route.js
//
// FIX (nouveau) : quand le scraping Render échoue (ex: HTTP 404 pour une
// combinaison banque/catégorie non implémentée côté Render), le bloc
// catch n'appelait JAMAIS enregistrerDocumentFinal() — l'entrée
// CentralBankPipeline restait bloquée en statut "pending" indéfiniment,
// jamais marquée "error" ni "skipped". Confirmé par l'archive R2 du
// 11 août : l'échec Render (404, AUD/statement) était bien écrit sur R2,
// mais l'entrée Back4App correspondante n'était jamais close.
//
// Conserve l'ajout précédent : fichiers R2 par devise
// (banques-centrales/{devise}.json), accumulés sans écrasement.

import { NextResponse } from "next/server";
import {
  lireReconnaissancesDuJour,
  enregistrerDocumentFinal,
  recupererDernierEventConnu,
} from "../../../../lib/central-bank-pipeline-service";
import { filtrerParagraphes } from "../../../../lib/paragraph-filter-service";
import {
  ecrireJSONDansR2,
  lireJSONDepuisR2,
  genererCleDuJour,
  genererCleArchiveDuJour,
} from "../../../../lib/r2-client";

export const maxDuration = 60;

async function mettreAJourFichierDevise(devise, entreeDuJour) {
  const cleDevise = `banques-centrales/${devise}.json`;

  let historique = [];
  try {
    const existant = await lireJSONDepuisR2(cleDevise);
    historique = existant.historique || [];
  } catch {
    historique = [];
  }

  const dateDuJour = entreeDuJour.date;
  const categorieDuJour = entreeDuJour.categorie;

  const historiqueFiltre = historique.filter(
    (h) => !(h.date === dateDuJour && h.categorie === categorieDuJour)
  );
  historiqueFiltre.push(entreeDuJour);
  historiqueFiltre.sort((a, b) => new Date(a.date) - new Date(b.date));

  await ecrireJSONDansR2(cleDevise, {
    devise,
    updatedAt: new Date().toISOString(),
    count: historiqueFiltre.length,
    historique: historiqueFiltre,
  });

  return cleDevise;
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entrees = await lireReconnaissancesDuJour();

  if (entrees.length === 0) {
    return NextResponse.json({ status: "skip", reason: "aucune entrée pending aujourd'hui" });
  }

  const resultats = [];
  const dateISOJour = new Date().toISOString().split("T")[0];

  for (const entree of entrees) {
    const banqueCentrale = entree.get("banqueCentrale");
    const categorie = entree.get("categorie");
    const devise = entree.get("deviseDetectee");

    try {
      const renderUrl = process.env.RENDER_SCRAPER_URL;
      const renderSecret = process.env.RENDER_SCRAPER_SECRET;
      if (!renderUrl || !renderSecret) throw new Error("RENDER_SCRAPER_URL ou RENDER_SCRAPER_SECRET manquant");

      const renderResponse = await fetch(`${renderUrl}/scrape/central-bank-statement`, {
        method: "POST",
        headers: { Authorization: `Bearer ${renderSecret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ banque: banqueCentrale, categorie }),
      });

      if (!renderResponse.ok) throw new Error(`Échec appel Render : HTTP ${renderResponse.status}`);
      const { success, texte, error: renderError } = await renderResponse.json();
      if (!success) throw new Error(renderError || "Le service Render a renvoyé une erreur");

      const phrases = filtrerParagraphes(texte, banqueCentrale);

      if (phrases.length === 0) {
        await enregistrerDocumentFinal(entree.id, []);
        const fallback = await recupererDernierEventConnu(devise);
        const documentFinal = fallback ? fallback.get("documentFinal") : [];
        resultats.push({ devise, banqueCentrale, categorie, status: "skip", reason: "aucun mot-clé trouvé", documentFinal });

        if (devise) {
          await mettreAJourFichierDevise(devise, {
            date: dateISOJour,
            banqueCentrale,
            categorie,
            status: "skip",
            documentFinal,
          });
        }
        continue;
      }

      const saved = await enregistrerDocumentFinal(entree.id, phrases);
      const documentFinal = saved.get("documentFinal");
      resultats.push({ devise, banqueCentrale, categorie, status: "ok", documentFinal });

      if (devise) {
        await mettreAJourFichierDevise(devise, {
          date: dateISOJour,
          banqueCentrale,
          categorie,
          status: "ok",
          documentFinal,
        });
      }

    } catch (error) {
      console.error(`Erreur scraping ${banqueCentrale}/${categorie} :`, error);
      resultats.push({ devise, categorie, status: "error", message: error.message, documentFinal: [] });

      // FIX : ferme proprement l'entrée Back4App même en cas d'erreur —
      // sans ça elle restait bloquée en "pending" indéfiniment. Utilise
      // le fallback du dernier document connu plutôt qu'un vide sec,
      // pour que le dashboard ait quand même quelque chose à montrer.
      try {
        const fallback = await recupererDernierEventConnu(devise);
        const documentFallback = fallback ? fallback.get("documentFinal") : [];
        await enregistrerDocumentFinal(entree.id, documentFallback);
      } catch (errFermeture) {
        console.error(`Erreur fermeture entrée ${banqueCentrale}/${categorie} après échec :`, errFermeture.message);
      }
    }
  }

  const cleR2 = genererCleDuJour("banque-centrale");
  await ecrireJSONDansR2(cleR2, {
    generatedAt: new Date().toISOString(),
    source: "cron/central-bank-scrape (automatique)",
    count: resultats.filter((r) => r.status === "ok").length,
    data: resultats,
  });

  const cleArchive = genererCleArchiveDuJour("banque-centrale");
  await ecrireJSONDansR2(cleArchive, {
    archivedAt: new Date().toISOString(),
    count: resultats.filter((r) => r.status === "ok").length,
    data: resultats,
  });

  return NextResponse.json({ status: "ok", cleR2, cleArchive, resultats });
}
