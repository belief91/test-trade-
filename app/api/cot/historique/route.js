// app/api/cot/historique/route.js
// Déclenche l'extraction historique CFTC 2025 -> aujourd'hui + upload vers Cloudflare R2
// Utilisé par cron/tâche planifiée, ou manuellement via POST

import { synchroniserHistoriqueCOT } from "@/lib/cot-historique-r2";

export async function POST() {
  try {
    const result = await synchroniserHistoriqueCOT("2025-01-01");
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
