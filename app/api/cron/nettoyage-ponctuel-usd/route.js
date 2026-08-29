// app/api/cron/nettoyage-ponctuel-usd/route.js
//
// SCRIPT PONCTUEL — à supprimer après exécution (voir conversation du
// 29/08). Retire l'entrée "fomc minutes" du 19/08 de
// database/banque-centrale/USD.json — un résultat de scraping
// incomplet (1 phrase, la mention légale de fin de document) migré
// avant que le filtre de qualité minimum n'existe.
//
// N'est PAS un outil réutilisable : chemin et critère de suppression
// codés en dur pour ce cas précis. Ne pas garder dans le projet une
// fois exécuté.

import { NextResponse } from "next/server";
import { ecrireJSONDansR2, lireJSONDepuisR2 } from "../../../../lib/r2-client";

export async function GET() {
  const cle = "database/banque-centrale/USD.json";

  try {
    const existant = await lireJSONDepuisR2(cle);
    const historique = existant.historique || [];

    const avant = historique.length;
    const nettoye = historique.filter(
      (h) => !(h.date === "2026-08-19" && h.categorie === "minutes")
    );
    const apres = nettoye.length;

    await ecrireJSONDansR2(cle, {
      devise: "USD",
      updatedAt: new Date().toISOString(),
      count: nettoye.length,
      historique: nettoye,
    });

    return NextResponse.json({
      status: "ok",
      cle,
      entreesAvant: avant,
      entreesApres: apres,
      entreesSupprimees: avant - apres,
    });
  } catch (error) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
