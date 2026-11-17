// app/api/debug-te/route.js
// ROUTE DE DIAGNOSTIC TEMPORAIRE — lecture seule, requetes simples (aucun contournement).
// A SUPPRIMER apres usage.

import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 30;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const COOKIE =
  "calendar-importance=3; calendar-range=3; " +
  "calendar-countries=aus,can,emu,jpn,gbr,usa,wld,nzl,che; cal-timezone-offset=180";

async function sonder(label, url, headers) {
  const out = { label, url };
  try {
    const r = await fetch(url, { headers, redirect: "manual" });
    const t = await r.text();
    out.status = r.status;
    out.headersReponse = Object.fromEntries(
      [...r.headers.entries()].filter(([k]) =>
        /waf|captcha|challenge|server|content-type|x-te|cf-|x-amz|location/i.test(k)
      )
    );
    out.longueur = t.length;
    out.contientCaptcha = /captcha/i.test(t);
    out.trDataEvent = (t.match(/<tr[^>]*data-event=/g) || []).length;
    out.debut = t.replace(/\s+/g, " ").slice(0, 350);
  } catch (e) {
    out.erreur = e.message;
  }
  return out;
}

export async function GET() {
  const base = "https://tradingeconomics.com";
  const resultats = [];

  // A. endpoint du calendrier, requete simple
  resultats.push(
    await sonder("A. /calendar?partial=calendar (cookies seuls)", `${base}/calendar?partial=calendar`, {
      "User-Agent": UA,
      Cookie: COOKIE,
    })
  );

  // B. meme endpoint avec les en-tetes que le JS du site envoie lui-meme
  resultats.push(
    await sonder(
      "B. /calendar?partial=calendar (+ X-TE-Partial, X-Requested-With)",
      `${base}/calendar?partial=calendar`,
      {
        "User-Agent": UA,
        Cookie: COOKIE,
        "X-TE-Partial": "calendar",
        "X-Requested-With": "XMLHttpRequest",
      }
    )
  );

  // C. page pays utilisee par la courbe de taux
  const c = await sonder("C. page courbe de taux (USA)", `${base}/united-states/government-bond-yield`, {
    "User-Agent": UA,
    "Accept-Language": "en-US,en;q=0.9",
  });
  try {
    const r = await fetch(`${base}/united-states/government-bond-yield`, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    const html = await r.text();
    const $ = cheerio.load(html);
    let lignesBonds = 0;
    $("table").each((_, tb) => {
      const h = $(tb).find("thead th, thead td, tr th").first().text().trim().toLowerCase();
      if (h === "bonds") lignesBonds = $(tb).find("tr").length;
    });
    c.tableBondsLignes = lignesBonds;
  } catch (e) {
    c.erreurTable = e.message;
  }
  resultats.push(c);

  return NextResponse.json({ horodatage: new Date().toISOString(), resultats });
}
