// app/api/test/central-bank-fed/lire/route.js
//
// Route de LECTURE SEULE pour la visualisation — distincte de
// app/api/test/central-bank-fed/route.js (celle-ci scrape et écrit,
// déclenchée par le cron). Cette route-ci ne fait que lire
// test/central-bank-fed.json depuis R2 et le renvoyer, pour que la page
// de visualisation puisse l'afficher côté client (le navigateur ne peut
// pas lire R2 directement).
//
// Pas d'authentification nécessaire : lecture seule, aucune action.

import { NextResponse } from "next/server";
import { lireJSONDepuisR2 } from "../../../../../lib/r2-client";

const CLE_R2_TEST = "test/central-bank-fed.json";

export async function GET() {
  try {
    const donnees = await lireJSONDepuisR2(CLE_R2_TEST);
    return NextResponse.json({ status: "ok", ...donnees });
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: `Fichier introuvable ou illisible : ${error.message}` },
      { status: 404 }
    );
  }
}
