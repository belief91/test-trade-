// app/api/debug-parse/route.js
// ROUTE DE DIAGNOSTIC TEMPORAIRE — lecture seule. A SUPPRIMER apres usage.
// Ne renvoie AUCUNE valeur secrete : seulement des booleens, des longueurs
// et les messages d'erreur de Parse.

import { NextResponse } from "next/server";
import Parse from "../../../lib/back4app-server.js";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 30;

function infoVar(nom) {
  const v = process.env[nom];
  if (v === undefined) return { present: false };
  return {
    present: true,
    longueur: v.length,
    espacesAuxBords: v !== v.trim(),
    contientGuillemets: /^["']|["']$/.test(v),
    contientRetourLigne: /[\r\n]/.test(v),
  };
}

async function essayer(label, fn) {
  try {
    const r = await fn();
    return { label, ok: true, resultat: r };
  } catch (e) {
    return { label, ok: false, message: e?.message, code: e?.code ?? null };
  }
}

export async function GET() {
  const serverURL = process.env.NEXT_PUBLIC_PARSE_SERVER_URL || "https://parseapi.back4app.com/";
  let hote = null;
  try {
    hote = new URL(serverURL).host;
  } catch {}

  const variables = {
    NEXT_PUBLIC_PARSE_APP_ID: infoVar("NEXT_PUBLIC_PARSE_APP_ID"),
    NEXT_PUBLIC_PARSE_JS_KEY: infoVar("NEXT_PUBLIC_PARSE_JS_KEY"),
    PARSE_MASTER_KEY: infoVar("PARSE_MASTER_KEY"),
    NEXT_PUBLIC_PARSE_SERVER_URL: { ...infoVar("NEXT_PUBLIC_PARSE_SERVER_URL"), hote },
  };

  const testSansMaster = await essayer("find Plan SANS master key (appId + jsKey)", async () => {
    const r = await new Parse.Query("Plan").limit(1).find();
    return { nb: r.length };
  });

  const testAvecMaster = await essayer("find Plan AVEC master key", async () => {
    const r = await new Parse.Query("Plan").limit(1).find({ useMasterKey: true });
    return { nb: r.length };
  });

  const testCountMaster = await essayer("count GeopoliticalNews AVEC master key", async () => {
    return { count: await new Parse.Query("GeopoliticalNews").count({ useMasterKey: true }) };
  });

  return NextResponse.json({
    horodatage: new Date().toISOString(),
    variables,
    tests: [testSansMaster, testAvecMaster, testCountMaster],
  });
}
