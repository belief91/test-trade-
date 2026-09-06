// app/api/cron/journal-reset-mensuel/route.js
import { NextResponse } from "next/server";
import {
  estDernierJourDuMois,
  reinitialiserJournalMensuel,
} from "../../../../lib/journal-reset-service";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/journal-reset-mensuel
 *
 * Appelée chaque jour par le cron (voir cron-beliefx.yml) — se
 * désactive elle-même tant que ce n'est pas le dernier jour du mois
 * (heure Madagascar), car GitHub Actions ne sait pas planifier
 * "dernier jour du mois" nativement.
 */
export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!estDernierJourDuMois()) {
    return NextResponse.json({ success: true, skipped: true, reason: "pas fin de mois" });
  }

  try {
    const resultat = await reinitialiserJournalMensuel();
    return NextResponse.json({ success: true, ...resultat });
  } catch (error) {
    console.error("Erreur reset mensuel journal :", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
