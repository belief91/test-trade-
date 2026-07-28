// app/api/cron/reconnaissance/route.js
import { executerReconnaissance } from "../../../../lib/reconnaissance-service";

export async function GET(request) {
  // Sécurité : vérifie que l'appel vient bien de Vercel Cron
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await executerReconnaissance();
    return Response.json({ status: "ok", result });
  } catch (error) {
    console.error("Erreur cron reconnaissance :", error);
    return Response.json({ status: "error", message: error.message }, { status: 500 });
  }
}
