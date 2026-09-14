// app/api/admin/categoriser-reponse-chat/route.js
//
// MÉTHODE GRATUITE : point de dépôt pour la réponse collée depuis
// Claude chat. Extrait MACRO/BC (archivage) et FUSION (dashboard),
// via lib/categorisation-reponse-service.js.
//
// Requête attendue : POST, body JSON { "texteReponse": "..." },
// header Authorization: Bearer <CRON_SECRET> (même secret que les
// autres routes admin/cron, pour rester cohérent).

import { NextResponse } from "next/server";
import { traiterReponseChat } from "../../../../lib/categorisation-reponse-service";

export const maxDuration = 30;

export async function POST(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { texteReponse } = body;

    if (!texteReponse || typeof texteReponse !== "string") {
      return NextResponse.json(
        { success: false, error: "Champ 'texteReponse' manquant ou invalide dans le body" },
        { status: 400 }
      );
    }

    const rapport = await traiterReponseChat(texteReponse);
    return NextResponse.json({ success: true, ...rapport });
  } catch (error) {
    console.error("Erreur catégorisation réponse chat :", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
