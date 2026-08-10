// app/api/cot/route.js
// FIX : ajout de force-dynamic / fetchCache pour empêcher Next.js de
// pré-rendre cette route en statique au build. Sans ça, la réponse était
// figée à la date du build et jamais rafraîchie (cause confirmée du
// symptôme "données COT disponibles seulement jusqu'au 3 août").

import { fetchCOT } from "../../../lib/cot-tff-service";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const data = await fetchCOT();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
