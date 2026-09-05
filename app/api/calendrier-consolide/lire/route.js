// app/api/calendrier-consolide/lire/route.js
//
// Route de LECTURE SEULE pour visualiser raw/{date}/calendrier-consolide.json
// (module Calendrier BC — différent et indépendant du module de test
// central-bank-fed). Ne déclenche aucun scraping, lit seulement ce qui
// a déjà été écrit par app/api/central-bank-calendar/route.js.

import { NextResponse } from "next/server";
import { lireJSONDepuisR2, genererCleDuJour } from "../../../../lib/r2-client";

export async function GET() {
  const cle = genererCleDuJour("calendrier-consolide");
  try {
    const donnees = await lireJSONDepuisR2(cle);
    return NextResponse.json({ status: "ok", cle, ...donnees });
  } catch (error) {
    return NextResponse.json(
      { status: "error", cle, message: `Fichier introuvable ou illisible : ${error.message}` },
      { status: 404 }
    );
  }
}
