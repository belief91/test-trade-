/**
 * Central Bank Calendar Service — BELIEFX
 * =========================================
 * Portage JS du scraper Python validé. Même méthode :
 *   - On envoie au serveur TradingEconomics les mêmes cookies que le
 *     navigateur utilise pour son propre filtrage (impact, semaine, pays,
 *     fuseau horaire), plutôt que de re-filtrer nous-mêmes en JS.
 *   - Le serveur renvoie donc du HTML déjà filtré : 3 étoiles (fort impact),
 *     "This Week", devises G10, heures en UTC+3.
 *
 * Dépendance à installer : npm install cheerio
 *
 * ⚠️ Points hérités de la version Python, toujours valables ici :
 *   - Sweden (SEK) et Norway (NOK) ne sont pas dans calendar-countries
 *     (voir COOKIES.calendarCountries plus bas). Ajoute-les si besoin,
 *     après avoir vérifié les vrais codes TE dans le navigateur.
 *   - L'heure est considérée comme déjà en UTC+3 grâce au cookie
 *     cal-timezone-offset=180 — non re-vérifié pour un environnement Vercel
 *     dont l'IP de sortie diffère de la tienne. Si le serveur TE applique
 *     une détection IP en plus du cookie, ça pourrait changer le résultat.
 *     À tester une fois déployé.
 */

import * as cheerio from "cheerio";

const CALENDAR_URL = "https://tradingeconomics.com/calendar";

const COOKIES = {
  "calendar-importance": "3",
  "calendar-range": "3", // "This Week"
  "calendar-countries": "aus,can,emu,jpn,gbr,usa,wld,nzl,che", // G10 (sans SEK/NOK pour l'instant)
  "cal-timezone-offset": "180", // UTC+3
};

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

const DATE_CLASS_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DAY_PATTERN =
  /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\w+\s+\d{1,2}\s+\d{4}/i;

// Code ISO 2 lettres (td.calendar-iso) -> devise
const ISO_TO_CURRENCY = {
  US: "USD",
  GB: "GBP",
  EA: "EUR",
  EU: "EUR",
  JP: "JPY",
  CA: "CAD",
  AU: "AUD",
  NZ: "NZD",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
};

function buildCookieHeader(cookiesObj) {
  return Object.entries(cookiesObj)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

/**
 * Convertit '04:45 PM' -> '16:45'. Retourne la chaîne d'origine si le
 * format ne correspond pas (ex: champ vide pour certains événements).
 */
function convertirEn24h(heureStr) {
  if (!heureStr) return "";
  const trimmed = heureStr.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return trimmed;

  let [, hh, mm, period] = match;
  hh = parseInt(hh, 10);
  period = period.toUpperCase();

  if (period === "AM") {
    if (hh === 12) hh = 0;
  } else {
    if (hh !== 12) hh += 12;
  }

  return `${String(hh).padStart(2, "0")}:${mm}`;
}

function trouverCelluleHeure($, row) {
  let heureTrouvee = "";
  $(row)
    .find("td")
    .each((_, td) => {
      if (heureTrouvee) return; // déjà trouvée, on arrête
      const classAttr = $(td).attr("class") || "";
      const classes = classAttr.split(/\s+/).filter(Boolean);
      if (classes.some((c) => DATE_CLASS_PATTERN.test(c))) {
        const span = $(td).find("span").first();
        heureTrouvee = span.length ? span.text().trim() : $(td).text().trim();
      }
    });
  return convertirEn24h(heureTrouvee);
}

function parseDateHeader($, row) {
  const text = $(row).text().replace(/\s+/g, " ").trim();
  const match = text.match(DAY_PATTERN);
  return match ? match[0] : null;
}

/**
 * Scrape le calendrier économique TradingEconomics, déjà filtré côté
 * serveur (impact fort, semaine en cours, devises G10).
 *
 * @returns {Promise<Array<Object>>} Liste d'événements
 */
export async function scraperCalendrierBC() {
  const response = await fetch(CALENDAR_URL, {
    headers: {
      ...HEADERS,
      Cookie: buildCookieHeader(COOKIES),
    },
  });

  if (!response.ok) {
    throw new Error(
      `Échec du scraping calendrier TE : HTTP ${response.status}`
    );
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const resultats = [];
  let dateCourante = null;

  $("tr").each((_, row) => {
    const dateDetectee = parseDateHeader($, row);
    if (dateDetectee) {
      dateCourante = dateDetectee;
      return; // continue vers la ligne suivante
    }

    const event = $(row).attr("data-event");
    if (!event) return; // pas une ligne d'événement

    const heure = trouverCelluleHeure($, row);

    const isoTag = $(row).find("td.calendar-iso").first();
    const isoCode = isoTag.length ? isoTag.text().trim() : "";
    const devise = ISO_TO_CURRENCY[isoCode] || isoCode;

    const actualText = $(row).find("td.calendar-item").eq(1).text().trim();
    const previousCell = $(row).find("td.calendar-item").eq(2).clone();
    previousCell.find('[id="revised"]').remove();
    const previousText = previousCell.text().trim();
    const consensusText = $(row).find("td.calendar-item").eq(3).text().trim();
    const forecastText = $(row).find("td.calendar-item").eq(4).text().trim();

    resultats.push({
      date: dateCourante,
      heureGmt3: heure, // déjà en UTC+3 (cookie) et en 24h
      devise,
      evenement: event,
      reel: actualText,
      precedent: previousText,
      consensus: consensusText,
      prevision: forecastText,
      impact: "Fort (3/3)", // garanti par le cookie calendar-importance=3
    });
  });

  return resultats;
}
