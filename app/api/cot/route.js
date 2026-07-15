// app/api/cot/route.js
// Dans l'App Router, une route API s'appelle toujours "route.js"
// et se place dans un dossier qui porte le nom de l'URL voulue.
// Ici : app/api/cot/route.js  →  accessible sur  tonsite.com/api/cot

import { fetchCOT } from "../../../lib/cot-tff-service";

export async function GET() {
  try {
    const data = await fetchCOT();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}