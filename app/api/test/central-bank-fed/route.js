// app/api/test/central-bank-fed/route.js
//
// ROUTE DE TEST ISOLÉE (29/08) — simulation réelle de production pour
// valider mécaniquement scrape -> filtre -> Back4App -> R2, SANS passer
// par le calendrier BC (pas de détection "y a-t-il un événement
// aujourd'hui") et SANS vérifier que le contenu date d'aujourd'hui
// (voir scrapers/testScraperFed.js côté Render — retourne toujours ce
// qui est présent au moment du scraping).
//
// Déclenchée par un vrai cron 4x/jour (voir cron-beliefx.yml, job
// test-central-bank-fed), pas par URL manuelle — pour observer le
// comportement réel dans les mêmes conditions que la production.
//
// Isolation totale de la production :
//   - Classe Back4App : TestCentralBankScrape (jamais CentralBankPipeline)
//   - Chemin R2 : test/central-bank-fed.json (jamais database/banque-centrale/)
//   - Scraper Render : /scrape/test-central-bank (jamais /scrape/central-bank)
//
// Boucle sur les 6 catégories Fed à chaque exécution, pour maximiser le
// signal par run (statement/minutes/presseConference n'existent que
// certains jours, discours est le plus susceptible de renvoyer un
// contenu réel à tout moment).

import { NextResponse } from "next/server";
import Parse from "../../../../lib/back4app-server";
import { scraperTestFedViaRender } from "../../../../lib/test-central-bank-client";
import { filtrerParagraphes } from "../../../../lib/paragraph-filter-service";
import { ecrireJSONDansR2, lireJSONDepuisR2 } from "../../../../lib/r2-client";

export const maxDuration = 60;

const CATEGORIES = ["statement", "minutes", "presseConference", "discours", "monetaryPolicyReport", "beigeBook"];
const CLE_R2_TEST = "test/central-bank-fed.json";

async function enregistrerDansBack4AppTest(categorie, resultat) {
  const TestCentralBankScrape = Parse.Object.extend("TestCentralBankScrape");
  const obj = new TestCentralBankScrape();

  obj.set("banqueCentrale", "Fed");
  obj.set("categorie", categorie);
  obj.set("horodatage", new Date());
  obj.set("status", resultat.status);
  obj.set("documentFinal", resultat.documentFinal || []);
  obj.set("pubDateSource", resultat.pubDate || null);
  obj.set("urlSource", resultat.source || null);
  obj.set("messageErreur", resultat.messageErreur || null);

  return await obj.save(null, { useMasterKey: true });
}

async function ajouterAuFichierTestR2(entree) {
  let historique = [];
  try {
    const existant = await lireJSONDepuisR2(CLE_R2_TEST);
    historique = existant.historique || [];
  } catch {
    historique = [];
  }

  historique.push(entree);
  // On garde tout l'historique du test — volume faible (4 runs x 6
  // catégories / jour), utile pour observer les patterns d'échec dans
  // le temps sans devoir recouper Back4App à chaque fois.

  await ecrireJSONDansR2(CLE_R2_TEST, {
    updatedAt: new Date().toISOString(),
    count: historique.length,
    historique,
  });
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resultatsRun = [];
  const horodatageRun = new Date().toISOString();

  for (const categorie of CATEGORIES) {
    let resultat;

    try {
      const { texte, pubDate, source } = await scraperTestFedViaRender(categorie);
      const phrases = filtrerParagraphes(texte, "Fed");

      resultat = {
        categorie,
        status: phrases.length > 0 ? "ok" : "vide_apres_filtre",
        documentFinal: phrases,
        pubDate,
        source,
      };
    } catch (error) {
      resultat = {
        categorie,
        status: "error",
        documentFinal: [],
        messageErreur: error.message,
      };
    }

    await enregistrerDansBack4AppTest(categorie, resultat);
    await ajouterAuFichierTestR2({ horodatageRun, ...resultat });
    resultatsRun.push(resultat);
  }

  return NextResponse.json({
    status: "ok",
    horodatageRun,
    resultats: resultatsRun.map((r) => ({
      categorie: r.categorie,
      status: r.status,
      nombrePhrases: (r.documentFinal || []).length,
      messageErreur: r.messageErreur || null,
    })),
  });
}
