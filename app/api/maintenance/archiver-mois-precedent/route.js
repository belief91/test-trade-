// app/api/maintenance/archiver-mois-precedent/route.js
//
// Archive le MOIS PRÉCÉDENT : déplace raw/{AAAA-MM-JJ}/* vers
// archives/{mois en français} {AAAA}/{JJ-MM-AAAA}/*
// ex : raw/2026-09-27/cot.json -> archives/septembre 2026/27-09-2026/cot.json
//
// Effet : raw/ ne contient plus que le mois en cours (« initialisation »).
// Ne touche jamais le mois en cours.
//
// Copie côté R2 (CopyObject, tous types de fichiers), vérifie la taille de
// la copie, PUIS supprime l'original. Jamais l'inverse.
// Idempotent et reprenable : s'arrête à 50 s et laisse le reste pour le
// prochain appel (le cron tente le 2, 3 et 4 du mois).
//
// GET /api/maintenance/archiver-mois-precedent
// Protégée par CRON_SECRET — action destructive.

import { NextResponse } from "next/server";
import { CopyObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, BUCKET_NAME, listerObjetsR2, supprimerObjetR2 } from "../../../../lib/r2-client";

export const maxDuration = 60;

const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function moisPrecedentGMT3() {
  const n = new Date();
  const d = new Date(n.getTime() + (180 + n.getTimezoneOffset()) * 60000);
  const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return { annee: p.getUTCFullYear(), mois: p.getUTCMonth() + 1 };
}

async function taille(cle) {
  const r = await r2Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: cle }));
  return r.ContentLength;
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const debut = Date.now();
  const { annee, mois } = moisPrecedentGMT3();
  const mm = String(mois).padStart(2, "0");
  const dossierMois = `${MOIS_FR[mois - 1]} ${annee}`; // "septembre 2026"

  try {
    const cles = await listerObjetsR2(`raw/${annee}-${mm}-`);
    if (cles.length === 0) {
      return NextResponse.json({ status: "skip", dossierMois, reason: "rien à archiver" });
    }

    let deplaces = 0;
    const erreurs = [];
    for (const ancienne of cles) {
      if (Date.now() - debut > 50000) break; // reprise au prochain appel
      const m = ancienne.match(/^raw\/(\d{4})-(\d{2})-(\d{2})\/(.+)$/);
      if (!m) continue;
      const [, a, mo, j, nom] = m;
      const nouvelle = `archives/${dossierMois}/${j}-${mo}-${a}/${nom}`; // "27-09-2026"
      try {
        await r2Client.send(new CopyObjectCommand({
          Bucket: BUCKET_NAME,
          Key: nouvelle,
          CopySource: encodeURI(`${BUCKET_NAME}/${ancienne}`),
        }));
        if ((await taille(ancienne)) !== (await taille(nouvelle))) throw new Error("taille différente");
        await supprimerObjetR2(ancienne); // jamais avant vérification
        deplaces++;
      } catch (e) {
        erreurs.push({ cle: ancienne, message: e.message });
      }
    }

    const restant = (await listerObjetsR2(`raw/${annee}-${mm}-`)).length;
    return NextResponse.json({ status: restant === 0 ? "termine" : "partiel", dossierMois, deplaces, restant, erreurs });
  } catch (e) {
    console.error("Erreur archivage mensuel :", e);
    return NextResponse.json({ status: "error", message: e.message }, { status: 500 });
  }
}
