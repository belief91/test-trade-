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

async function sonder(label, headers) {
  const out = { label };
  try {
    const res = await fetch(CALENDAR_URL, { headers, redirect: "follow" });
    const html = await res.text();
    const $ = cheerio.load(html);
    const lower = html.toLowerCase();

    out.status = res.status;
    out.finalUrl = res.url;
    out.contentType = res.headers.get("content-type");
    out.server = res.headers.get("server");
    out.cfRay = res.headers.get("cf-ray");
    out.htmlLength = html.length;
    out.title = $("title").first().text().trim();
    out.trCount = $("tr").length;
    out.dataEventCount = $("tr[data-event]").length;
    out.calendarIsoCount = $("td.calendar-iso").length;
    out.calendarItemCount = $("td.calendar-item").length;
    out.marqueursBlocage = {
      justAMoment: lower.includes("just a moment"),
      cfChallenge: lower.includes("cf-chl") || lower.includes("challenge-platform"),
      captcha: lower.includes("captcha"),
      accessDenied: lower.includes("access denied") || lower.includes("forbidden"),
      rateLimit: lower.includes("too many requests"),
    };
    out.exempleDonneesEvenement = $("tr[data-event]")
      .slice(0, 2)
      .map((_, el) => $(el).text().replace(/\s+/g, " ").trim().slice(0, 160))
      .get();
    out.debutCorps = $("body").text().replace(/\s+/g, " ").trim().slice(0, 300);
  } catch (e) {
    out.erreur = e.message;
  }
  return out;
}

export async function GET() {
  const avecCookies = await sonder("avec cookies (config actuelle)", {
    "User-Agent": UA,
    Cookie: cookieHeader(COOKIES),
  });
  const sansCookies = await sonder("sans cookies (page brute)", {
    "User-Agent": UA,
  });

  return NextResponse.json({
    horodatage: new Date().toISOString(),
    avecCookies,
    sansCookies,
  });
}
