// app/api/admin/assembler-json-jour/route.js
//
// MÉTHODE GRATUITE : génère le document du jour (5 prompts remplis +
// prompt de fusion) et le renvoie en téléchargement direct, prêt à
// uploader dans Claude.ai (chat).
//
// Protection : même secret que la route cron, pour rester cohérent avec
// l'existant plutôt que d'inventer un nouveau mécanisme d'auth.

import { NextResponse } from "next/server";
import { assemblerDocumentDuJour } from "../../../../lib/assemblage-manuel-service";

export const maxDuration = 30;

export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { dateStr, promptComplet } = await assemblerDocumentDuJour();

    return new NextResponse(JSON.stringify({ dateStr, promptComplet }, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="beliefx-assemblage-${dateStr}.json"`,
      },
    });
  } catch (error) {
    console.error("Erreur assemblage document du jour :", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
