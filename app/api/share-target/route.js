import { NextResponse } from "next/server";
import Parse from "parse/node";

Parse.initialize(
  process.env.NEXT_PUBLIC_PARSE_APP_ID,
  process.env.NEXT_PUBLIC_PARSE_JS_KEY
);
Parse.serverURL = process.env.NEXT_PUBLIC_PARSE_SERVER_URL || "https://parseapi.back4app.com/";

/**
 * Reçoit une image partagée depuis le menu "Partager" d'Android (uniquement
 * disponible quand BELIEFX est installé en PWA — "Ajouter à l'écran d'accueil").
 * L'image est uploadée immédiatement vers Back4App, puis l'utilisateur est
 * redirigé vers le module Screenshots (entièrement indépendant du Journal),
 * où une nouvelle paire est créée automatiquement avec cette capture en "avant".
 *
 * ⚠️ Cette route utilise le SDK Parse sans session utilisateur (Application ID
 * + JavaScript Key uniquement, jamais la Master Key côté serveur non plus ici).
 * Si l'upload public est désactivé côté Back4App (App Settings > Server
 * Settings > Core Settings > File Upload), cette route échouera avec la même
 * erreur "File upload by public is disabled" que l'upload classique — voir
 * le README pour la marche à suivre.
 */
export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("screenshot");

    if (!file) {
      return NextResponse.redirect(new URL("/screenshots?shareError=1", req.url));
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parseFile = new Parse.File(`partage-${Date.now()}.jpg`, { base64: buffer.toString("base64") });
    await parseFile.save();

    const url = encodeURIComponent(parseFile.url());

    return NextResponse.redirect(
      new URL(`/screenshots?sharedUrl=${url}`, req.url)
    );
  } catch (err) {
    return NextResponse.redirect(new URL("/screenshots?shareError=1", req.url));
  }
}
