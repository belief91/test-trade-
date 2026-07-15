import { NextResponse } from "next/server";
import { scraperCalendrierBC } from "../../../lib/central-bank-calendar-service.js";
import Parse from "../../../lib/back4app-server.js";

/**
 * Sauvegarde les événements dans Back4App, classe "CentralBankCalendar".
 * Utilise saveAll pour les enregistrer en une seule opération batch plutôt
 * qu'un .save() par événement (plus efficace, moins de requêtes réseau).
 *
 * ⚠️ Suppose une classe Parse "CentralBankCalendar" (à créer dans le
 * dashboard Back4App si elle n'existe pas encore — Parse la crée
 * automatiquement au premier save si le schéma n'est pas verrouillé,
 * mais vérifie tes réglages de sécurité Back4App si ça échoue).
 */
async function sauvegarderVersBack4App(evenements) {
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

  return Parse.Object.saveAll(objets, { useMasterKey: true });
}

/**
 * GET /api/central-bank-calendar
 *
 * Retourne les événements de calendrier économique à fort impact (G10,
 * semaine en cours) déjà filtrés côté serveur TradingEconomics, et les
 * sauvegarde dans Back4App.
 */
export async function GET() {
  try {
    const evenements = await scraperCalendrierBC();

    await sauvegarderVersBack4App(evenements);

    return NextResponse.json({
      success: true,
      count: evenements.length,
      data: evenements,
    });
  } catch (error) {
    console.error("Erreur scraping calendrier BC :", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
