// app/api/central-bank-calendar/route.js
//
// FIX ARCHITECTURAL : R2 devient la SEULE source de verite pour
// l'historique du calendrier (via lib/calendrier-archive-r2.js).
//
// FIX PERF (26/08) : maxDuration en filet de securite.
//
// FIX CRITIQUE #4 (05/09) : construireContexteMacroDuJour() retourne
// desormais clesTraitees au lieu de dateCible/dateUtiliseeEnFallback
// (toute logique basee sur l'horloge a ete abandonnee, voir
// lib/macro-consolidator-service.js). Ces cles sont enregistrees ICI,
// APRES confirmation que l'ecriture R2 du fichier consolide a reussi —
// jamais avant, pour ne pas marquer un evenement comme "traite" si la
// sauvegarde a echoue (auquel cas il redeviendra eligible au prochain
// run, comportement voulu).
//
// FIX (16/11/2026) : calendrier BC vide. TradingEconomics charge desormais
// le calendrier en JS derriere un CAPTCHA AWS WAF ; le scraper ne recoit
// plus aucun evenement. Avant : count=0 traite comme un succes, et R2
// (calendrier-bc.json / calendrier-consolide.json du jour) ecrase avec un
// fichier vide. Maintenant : si le scraping echoue, AUCUNE ecriture
// (Back4App, R2, deja-traites, archive) n'est faite, la route repond 502
// (le cron echoue visiblement) et renvoie les evenements de la semaine
// courante deja presents dans l'archive R2 pour que l'UI reste utile.

import { NextResponse } from "next/server";
import { scraperCalendrierBC } from "../../../lib/central-bank-calendar-service.js";
import Parse from "../../../lib/back4app-server.js";
import { ecrireJSONDansR2, genererCleDuJour } from "../../../lib/r2-client";
import { construireContexteMacroDuJour } from "../../../lib/macro-consolidator-service";
import {
  fusionnerDansArchiveCalendrier,
  enregistrerEvenementsTraites,
  lireArchiveCalendrier,
} from "../../../lib/calendrier-archive-r2";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const MOIS_EN = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

// "Monday November 16 2026" -> timestamp UTC minuit de ce jour (ou null)
function dateEvenementEnUTC(str) {
  const m = /([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})/.exec(str || "");
  if (!m) return null;
  const mois = MOIS_EN[m[1].toLowerCase()];
  if (mois === undefined) return null;
  return Date.UTC(Number(m[3]), mois, Number(m[2]));
}

// Lundi -> dimanche de la semaine courante, en GMT+3 (fuseau de l'app)
function bornesSemaineCouranteUTC() {
  const maintenant = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const jour = Date.UTC(
    maintenant.getUTCFullYear(),
    maintenant.getUTCMonth(),
    maintenant.getUTCDate()
  );
  const depuisLundi = (maintenant.getUTCDay() + 6) % 7;
  const lundi = jour - depuisLundi * 24 * 60 * 60 * 1000;
  return { debut: lundi, fin: lundi + 6 * 24 * 60 * 60 * 1000 };
}

function filtrerSemaineCourante(evenements) {
  const { debut, fin } = bornesSemaineCouranteUTC();
  return evenements.filter((e) => {
    const t = dateEvenementEnUTC(e.date);
    return t !== null && t >= debut && t <= fin;
  });
}

async function upsertVersBack4App(evenements) {
  const CentralBankCalendar = Parse.Object.extend("CentralBankCalendar");
  let nouveaux = 0;
  let misAJour = 0;

  for (const e of evenements) {
    const requete = new Parse.Query(CentralBankCalendar);
    requete.equalTo("devise", e.devise);
    requete.equalTo("evenement", e.evenement);
    requete.equalTo("date", e.date);
    const existant = await requete.first({ useMasterKey: true });

    const obj = existant || new CentralBankCalendar();
    obj.set("date", e.date);
    obj.set("heureGmt3", e.heureGmt3);
    obj.set("devise", e.devise);
    obj.set("evenement", e.evenement);
    obj.set("reel", e.reel);
    obj.set("precedent", e.precedent);
    obj.set("consensus", e.consensus);
    obj.set("prevision", e.prevision);
    obj.set("impact", e.impact);

    await obj.save(null, { useMasterKey: true });
    if (existant) {
      misAJour++;
    } else {
      nouveaux++;
    }
  }

  return { nouveaux, misAJour };
}

// Scraping en echec : aucune ecriture, 502 + repli sur l'archive R2.
async function reponseScrapingEchoue(error) {
  console.error("Scraping calendrier BC impossible :", error);
  let data = [];
  try {
    data = filtrerSemaineCourante(await lireArchiveCalendrier());
  } catch (e) {
    console.error("Lecture archive R2 impossible :", e);
  }
  return NextResponse.json(
    {
      success: false,
      error: error.message,
      scrapingBloque: error?.name === "ScrapingBloqueError",
      source: "archive-r2",
      count: data.length,
      data,
    },
    { status: 502 }
  );
}

export async function GET() {
  let evenements;
  try {
    evenements = await scraperCalendrierBC();
  } catch (error) {
    return reponseScrapingEchoue(error);
  }

  try {
    const { nouveaux, misAJour } = await upsertVersBack4App(evenements);

    const {
      contextePartage,
      evenements: evenementsAvecContexte,
      clesTraitees,
    } = await construireContexteMacroDuJour(evenements);

    const cleR2 = genererCleDuJour("calendrier-bc");
    await ecrireJSONDansR2(cleR2, {
      scrapedAt: new Date().toISOString(),
      count: evenements.length,
      data: evenements,
    });

    const cleR2Consolide = genererCleDuJour("calendrier-consolide");
    await ecrireJSONDansR2(cleR2Consolide, {
      generatedAt: new Date().toISOString(),
      count: evenementsAvecContexte.length,
      contextePartage,
      data: evenementsAvecContexte,
    });

    // FIX CRITIQUE #4 (05/09) : enregistré seulement APRÈS confirmation
    // que l'écriture ci-dessus a réussi (aucune exception levée avant
    // ce point). Si l'écriture R2 avait échoué, on ne serait jamais
    // arrivé ici — les événements resteraient éligibles au run suivant.
    await enregistrerEvenementsTraites(clesTraitees);

    const archive = await fusionnerDansArchiveCalendrier(evenements);

    return NextResponse.json({
      success: true,
      count: evenements.length,
      nouveaux,
      misAJour,
      cleR2,
      cleR2Consolide,
      clesTraiteesCeRun: clesTraitees,
      archive,
      data: evenements,
      contexteMacro: evenementsAvecContexte,
    });
  } catch (error) {
    console.error("Erreur scraping calendrier BC :", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
