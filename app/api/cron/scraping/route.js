import { NextResponse } from "next/server";
import { scraperCalendrierBC } from "../../../../lib/central-bank-calendar-service.js";
import Parse from "../../../../lib/back4app-server.js";

/**
 * GET /api/cron/scraping
 *
 * Appelé automatiquement par Vercel Cron tous les jours à 19h00 UTC
 * (voir vercel.json). Scrape le calendrier économique BC (G10, fort
 * impact, semaine en cours) et sauvegarde dans Back4App.
 *
 * Sécurité : Vercel envoie automatiquement un header
 *   Authorization: Bearer <CRON_SECRET>
 * quand il déclenche ce cron. On vérifie ce header pour empêcher que
 * n'importe qui appelle cette route publiquement (ex: en devinant l'URL).
 *
 * ⚠️ ACTION REQUISE avant que ça fonctionne en production :
 *   1. Génère un secret : openssl rand -hex 32  (ou tout générateur de
 *      mot de passe, 32+ caractères)
 *   2. Ajoute-le dans Vercel : Project Settings > Environment Variables
 *      Nom : CRON_SECRET, Valeur : le secret généré
 *   3. Ajoute-le aussi dans ton .env.local pour les tests locaux
 *
 * Sans ça, la vérification ci-dessous renverra toujours 401, y compris
 * pour Vercel lui-même.
 */
export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const evenements = await scraperCalendrierBC();

    const CentralBankCalendar = Parse.Object.extend("CentralBankCalendar");
    const objets = evenements.map((e) => {
      const obj = new CentralBankCalendar();
      obj.set("date", e.date);
      obj.set("heureGmt3", e.heureGmt3);
      obj.set("devise", e.devise);
      obj.set("evenement", e.evenement);
      obj.set("reel", e.reel);
      obj.set("precedent", e.precedent);
      obj.set("consensus", e.consensus);
      obj.set("prevision", e.prevision);
      obj.set("impact", e.impact);
      return obj;
    });
    await Parse.Object.saveAll(objets, { useMasterKey: true });

    return NextResponse.json({
      success: true,
      count: evenements.length,
    });
  } catch (error) {
    console.error("Erreur cron scraping calendrier BC :", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}