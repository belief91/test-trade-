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
// le chemin /scrape/central-bank-statement, qui n'existe pas. Corrigé —
// utilise scraperBanqueCentraleViaRender() (lib/central-bank-render-client.js).
//
// FIX CRITIQUE #2 (27/08) : le catch ne faisait RIEN sur l'entrée
// Back4App en échec — elle restait bloquée à "pending" pour toujours.
// Corrigé conjointement avec lib/central-bank-pipeline-service.js :
// enregistrerEchecScraping() + fenêtre de rattrapage de 4 jours.
//
// FIX CRITIQUE #3 (28/08) : le fix #2 n'a rien produit en production —
// bug de requête Parse (lessThan sur champ absent = exclusion
// silencieuse), corrigé dans central-bank-pipeline-service.js le même
// jour. CE bug-là a produit un silence total pendant ~24h : la requête
// renvoyait 0 résultat, et cette route retournait "skip" SANS JAMAIS
// toucher R2 — aucune trace, indiscernable d'un cron qui n'a jamais
// tourné. D'où le fix d'observabilité ci-dessous : même un "rien à
// traiter" laisse maintenant une trace horodatée sur R2, pour que ce
// genre de silence soit visible et diagnosticable immédiatement la
// prochaine fois, au lieu de rester invisible pendant un jour entier.

import { NextResponse } from "next/server";
import {
  lireReconnaissancesDuJour,
  enregistrerDocumentFinal,
  enregistrerEchecScraping,
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
 * jour + même catégorie si elle existe déjà.
 */
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

/**
 * GET /api/cron/central-bank-scrape
 * Boucle sur TOUTES les entrées "pending" à traiter (aujourd'hui +
 * rattrapage jusqu'à 4 jours en arrière).
 */
export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entrees = await lireReconnaissancesDuJour();

  if (entrees.length === 0) {
    // FIX OBSERVABILITÉ (28/08) : avant, un "rien à traiter" ne touchait
    // jamais R2 — indiscernable d'un cron qui n'a jamais tourné, ou d'un
    // bug de requête qui exclut tout silencieusement (exactement ce qui
    // s'est passé pendant ~24h avec le bug lessThan/champ-absent corrigé
    // dans central-bank-pipeline-service.js). Désormais, une exécution
    // "vide" laisse quand même une trace horodatée sur R2.
    const cleR2Vide = genererCleDuJour("banque-centrale");
    await ecrireJSONDansR2(cleR2Vide, {
      generatedAt: new Date().toISOString(),
      source: "cron/central-bank-scrape (automatique)",
      status: "skip",
      reason: "aucune entrée pending à traiter",
      count: 0,
      data: [],
    });
    return NextResponse.json({ status: "skip", reason: "aucune entrée pending a traiter", cleR2: cleR2Vide });
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
      const entreeMaj = await enregistrerEchecScraping(entree.id, error.message);
      resultats.push({
        devise,
        categorie,
        status: "error",
        message: error.message,
        tentatives: entreeMaj.get("tentatives"),
        documentFinal: [],
      });
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
