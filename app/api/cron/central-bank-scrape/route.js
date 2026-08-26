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
//
// FIX RÉGRESSION (26/08) : cette route appelait directement Render avec
// le chemin /scrape/central-bank-statement, qui n'existe pas (la route
// réelle côté Render est /scrape/central-bank — voir index.js du repo
// BELIEFX-scraping). Chaque exécution automatique recevait donc un 404
// pour TOUTES les devises, silencieusement absorbé par le catch plus bas
// (aucune écriture dans banques-centrales/{devise}.json en cas d'erreur,
// par design). Confirmé par les logs Render : aucune requête
// /scrape/central-bank* n'apparaît jamais dans les logs applicatifs.
//
// Le chemin correct existe déjà et est centralisé dans
// lib/central-bank-render-client.js (créé au commit c679b26 du 19-20/08
// pour exactement éviter ce genre de divergence), et déjà utilisé
// correctement par app/api/pipeline/run/route.js (bouton manuel du
// dashboard). Ce même commit avait remis par erreur l'ancien chemin cassé
// ICI en même temps qu'il corrigeait pipeline/run — probablement un
// copier-coller entre les deux fichiers pendant l'édition. Cette route
// utilise désormais scraperBanqueCentraleViaRender(), comme pipeline/run,
// pour ne plus jamais diverger entre les deux appelants.

import { NextResponse } from "next/server";
import {
  lireReconnaissancesDuJour,
  enregistrerDocumentFinal,
  recupererDernierEventConnu,
} from "../../../../lib/central-bank-pipeline-service";
import { scraperBanqueCentraleViaRender } from "../../../../lib/central-bank-render-client";
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
      const texte = await scraperBanqueCentraleViaRender(banqueCentrale, categorie);

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
