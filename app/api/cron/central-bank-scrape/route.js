// app/api/cron/central-bank-scrape/route.js
//
// AJOUT : en plus du fichier combiné raw/{date}/banque-centrale.json déjà
// existant (conservé tel quel, aucune régression), écrit maintenant un
// fichier PAR DEVISE sous banques-centrales/{devise}.json — accumulé au
// fil des jours (lecture de l'existant + ajout, jamais d'écrasement),
// contenant le document déjà filtré (documentFinal), pas le brut.
//
// Dédoublonnage : une entrée par (date + categorie) — si le cron est
// rejoué le même jour pour la même catégorie, l'ancienne entrée du jour
// est remplacée plutôt que dupliquée.
//
// La liste des devises n'est PAS codée en dur : chaque devise réellement
// détectée dans CentralBankPipeline ce jour-là obtient/alimente son
// fichier — évite de se tromper sur la composition exacte du G10.

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

/**
 * Ajoute l'entrée du jour au fichier historique de la devise, sans
 * écraser les entrées précédentes. Remplace uniquement l'entrée du même
 * jour + même catégorie si elle existe déjà (rejouer le cron le même
 * jour ne duplique pas).
 */
async function mettreAJourFichierDevise(devise, entreeDuJour) {
  const cleDevise = `banques-centrales/${devise}.json`;

  let historique = [];
  try {
    const existant = await lireJSONDepuisR2(cleDevise);
    historique = existant.historique || [];
  } catch {
    // Fichier pas encore créé pour cette devise — première écriture
    historique = [];
  }

  const dateDuJour = entreeDuJour.date;
  const categorieDuJour = entreeDuJour.categorie;

  const historiqueFiltre = historique.filter(
    (h) => !(h.date === dateDuJour && h.categorie === categorieDuJour)
  );
  historiqueFiltre.push(entreeDuJour);

  // Tri chronologique, plus ancien en premier
  historiqueFiltre.sort((a, b) => new Date(a.date) - new Date(b.date));

  await ecrireJSONDansR2(cleDevise, {
    devise,
    updatedAt: new Date().toISOString(),
    count: historiqueFiltre.length,
    historique: historiqueFiltre,
  });

  return cleDevise;
}

/**
 * GET /api/cron/central-bank-scrape
 * Boucle sur TOUTES les entrées "pending" du jour.
 * Upload vers R2 à la fin : raw/{date}/banque-centrale.json (instantané
 * journalier pour la fusion IA) + database/banque-centrale/{date}.json
 * (archive permanente, jamais écrasée) + banques-centrales/{devise}.json
 * par devise (historique accumulé, jamais écrasé).
 * Déclenché automatiquement à 00h15 GMT+3 (21h15 UTC) via GitHub Actions.
 */
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
      // Pas d'écriture dans le fichier par devise en cas d'erreur — on ne
      // veut pas polluer l'historique avec une entrée vide/en échec.
    }
  }

  // Upload R2 — même clé que pipeline/run pour que la synthèse IA
  // trouve toujours raw/{date}/banque-centrale.json peu importe
  // lequel des deux a été déclenché ce jour-là.
  const cleR2 = genererCleDuJour("banque-centrale");
  await ecrireJSONDansR2(cleR2, {
    generatedAt: new Date().toISOString(),
    source: "cron/central-bank-scrape (automatique)",
    count: resultats.filter((r) => r.status === "ok").length,
    data: resultats,
  });

  // Archive permanente — database/banque-centrale/{date}.json, jamais
  // écrasée ni nettoyée, backup durable en plus de Back4App
  const cleArchive = genererCleArchiveDuJour("banque-centrale");
  await ecrireJSONDansR2(cleArchive, {
    archivedAt: new Date().toISOString(),
    count: resultats.filter((r) => r.status === "ok").length,
    data: resultats,
  });

  return NextResponse.json({ status: "ok", cleR2, cleArchive, resultats });
}
