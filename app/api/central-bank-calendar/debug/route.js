// app/api/central-bank-calendar/debug/route.js
// ROUTE DE DIAGNOSTIC TEMPORAIRE — lecture seule (aucune ecriture R2 / Back4App).
// A supprimer une fois le probleme du calendrier BC resolu.

import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 30;

const CALENDAR_URL = "https://tradingeconomics.com/calendar";

const COOKIES = {
  "calendar-importance": "3",
  "calendar-range": "3",
  "calendar-countries": "aus,can,emu,jpn,gbr,usa,wld,nzl,che",
  "cal-timezone-offset": "180",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function cookieHeader(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function extraits(html, mot, n = 4, avant = 150, apres = 450) {
  const res = [];
  let idx = 0;
  while (res.length < n) {
    idx = html.indexOf(mot, idx);
    if (idx === -1) break;
    res.push(html.slice(Math.max(0, idx - avant), idx + apres).replace(/\s+/g, " "));
    idx += mot.length;
  }
  return res;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const res = await fetch(CALENDAR_URL, {
    headers: { "User-Agent": UA, Cookie: cookieHeader(COOKIES) },
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const motsCles = {};
  [
    "te-calendar-body",
    "TEWaf.fetch(",
    "$.ajax",
    "$.get(",
    "$.post(",
    "$.getJSON",
    "loadCalendar",
    "calendar/",
    "/token",
    "x-amzn-waf",
    "challenge.js",
    "awswaf",
    "/ajax",
    "Loading",
  ].forEach((m) => {
    motsCles[m] = { occurrences: html.split(m).length - 1, extraits: extraits(html, m) };
  });

  // Appel d'un endpoint candidat fourni en parametre ?probe=/chemin
  let sonde = null;
  const probe = searchParams.get("probe");
  if (probe && probe.startsWith("/")) {
    try {
      const r = await fetch("https://tradingeconomics.com" + probe, {
        headers: { "User-Agent": UA, Cookie: cookieHeader(COOKIES) },
      });
      const t = await r.text();
      sonde = {
        probe,
        status: r.status,
        wafAction: r.headers.get("x-amzn-waf-action"),
        contentType: r.headers.get("content-type"),
        longueur: t.length,
        debut: t.slice(0, 600),
      };
    } catch (e) {
      sonde = { probe, erreur: e.message };
    }
  }

  return NextResponse.json({
    horodatage: new Date().toISOString(),
    calendarBodyHtml: $("#te-calendar-body").html()?.replace(/\s+/g, " ").slice(0, 1200),
    calendarAreaHtml: $("#te-calendar-area").html()?.replace(/\s+/g, " ").slice(0, 600),
    motsCles,
    sonde,
  });
}
