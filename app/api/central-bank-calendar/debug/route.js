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

function extraits(html, mot, n = 3, rayon = 250) {
  const res = [];
  let idx = 0;
  while (res.length < n) {
    idx = html.indexOf(mot, idx);
    if (idx === -1) break;
    res.push(html.slice(Math.max(0, idx - rayon), idx + rayon).replace(/\s+/g, " "));
    idx += mot.length;
  }
  return res;
}

export async function GET() {
  const res = await fetch(CALENDAR_URL, {
    headers: { "User-Agent": UA, Cookie: cookieHeader(COOKIES) },
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const classesCalendar = new Set();
  $("[class]").each((_, el) => {
    const c = ($(el).attr("class") || "").split(/\s+/);
    c.forEach((x) => {
      if (/calendar|event|econ/i.test(x)) classesCalendar.add(x);
    });
  });

  const idsCalendar = [];
  $("[id]").each((_, el) => {
    const id = $(el).attr("id");
    if (/calendar|event|econ/i.test(id)) idsCalendar.push(id);
  });

  const compteurs = {};
  ["table", "tbody", "thead", "tr", "td", "li", "div", "script", "iframe"].forEach(
    (t) => (compteurs[t] = $(t).length)
  );

  const scriptsSrc = $("script[src]")
    .map((_, el) => $(el).attr("src"))
    .get()
    .slice(0, 40);

  // Scripts inline volumineux (donnees embarquees ?)
  const gros = $("script:not([src])")
    .map((_, el) => {
      const t = $(el).html() || "";
      return t.length > 5000
        ? { longueur: t.length, debut: t.slice(0, 200).replace(/\s+/g, " ") }
        : null;
    })
    .get()
    .filter(Boolean)
    .slice(0, 10);

  const motsCles = {};
  [
    "data-event",
    "calendar-iso",
    "calendar-item",
    "Interest Rate Decision",
    "Retail Sales",
    "Nonfarm",
    "__NEXT_DATA__",
    "/ws/",
    "calendar/",
    "fetch(",
    "XMLHttpRequest",
    "calendar-range",
  ].forEach((m) => {
    motsCles[m] = { occurrences: html.split(m).length - 1, extraits: extraits(html, m, 2) };
  });

  return NextResponse.json({
    horodatage: new Date().toISOString(),
    status: res.status,
    htmlLength: html.length,
    compteurs,
    classesCalendar: [...classesCalendar].slice(0, 60),
    idsCalendar: idsCalendar.slice(0, 40),
    scriptsSrc,
    grosScriptsInline: gros,
    motsCles,
    corpsApresScripts: $("body")
      .clone()
      .find("script,style,noscript")
      .remove()
      .end()
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200),
  });
}
