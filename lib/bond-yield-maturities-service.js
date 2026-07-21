/**
 * bond-yield-maturities-service.js
 * ------------------------------------------------------------------
 * A placer dans E:\trading-journal\lib\ (même pattern que
 * central-bank-calendar-service.js) — PAS dans E:\scraping.
 *
 * Ce fichier ne fait QUE scraper + parser. La sauvegarde Back4App est
 * gérée par la route (app/api/bond-yields/route.js), pas ici — même
 * séparation des responsabilités que ton pattern calendar existant.
 *
 * Scraping des yields 2Y / 5Y / 10Y pour les 8 devises G10, en
 * exploitant le tableau "Bonds" présent sur CHAQUE page pays de
 * tradingeconomics.com (ex: /united-states/government-bond-yield).
 * Une seule requête par pays suffit (le tableau liste toutes les
 * maturités du pays).
 *
 * Structure CONFIRMÉE par test réel (20/07/2026, US) :
 *   td[0]=label ("US 10Y"), td[1]=yield, td[2]=blank/icône,
 *   td[3]=day%, td[4]=month%, td[5]=year%, td[6]=date
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Mapping devise -> slug pays TradingEconomics.
// EUR -> germany (bund) confirmé comme proxy, "euro-area" n'existe pas sur TE.
const G10_COUNTRIES = [
  { currency: 'USD', slug: 'united-states', label: 'United States' },
  { currency: 'EUR', slug: 'germany', label: 'Germany' },
  { currency: 'GBP', slug: 'united-kingdom', label: 'United Kingdom' },
  { currency: 'JPY', slug: 'japan', label: 'Japan' },
  { currency: 'CAD', slug: 'canada', label: 'Canada' },
  { currency: 'AUD', slug: 'australia', label: 'Australia' },
  { currency: 'CHF', slug: 'switzerland', label: 'Switzerland' },
  { currency: 'NZD', slug: 'new-zealand', label: 'New Zealand' },
];

const MATURITIES_WANTED = [2, 5, 10]; // en années

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Récupère le HTML de la page bond de référence (10Y) d'un pays.
 * Son tableau "Bonds" liste aussi 2Y, 5Y et les autres maturités.
 */
async function fetchCountryBondPage(slug) {
  const url = `https://tradingeconomics.com/${slug}/government-bond-yield`;
  const response = await axios.get(url, {
    headers: REQUEST_HEADERS,
    timeout: 15000,
  });
  return response.data;
}

/**
 * Trouve la table "Bonds" via le texte exact de son en-tête
 * (plus robuste qu'une classe CSS devinée).
 */
function findBondsTable($) {
  let targetTable = null;

  $('table').each((_, table) => {
    const $table = $(table);
    const firstHeaderText = $table.find('thead th, thead td, tr th').first().text().trim();
    if (firstHeaderText.toLowerCase() === 'bonds') {
      targetTable = $table;
      return false;
    }
  });

  return targetTable;
}

/**
 * Parse une page pays et retourne uniquement les maturités demandées
 * (2Y, 5Y, 10Y), avec country/currency injectés depuis la config.
 */
function parseCountryMaturities(html, countryConfig) {
  const $ = cheerio.load(html);
  const $table = findBondsTable($);

  if (!$table) {
    console.warn(
      `[bond-yield-maturities] Table "Bonds" introuvable pour ${countryConfig.label} — structure HTML probablement différente.`
    );
    return [];
  }

  const results = [];

  $table.find('tbody tr, tr').each((_, row) => {
    const $row = $(row);
    const $link = $row.find('a').first();
    const label = $link.text().trim(); // ex: "US 5Y", "US 10Y TIPS"

    if (!label) return;

    const match = label.match(/(\d+)Y$/);
    if (!match) return;

    const maturityYears = parseInt(match[1], 10);
    if (!MATURITIES_WANTED.includes(maturityYears)) return;

    const cells = $row.find('td');
    const rawTexts = cells.map((_, td) => $(td).text().trim()).get();

    const yieldValue = rawTexts[1] ? parseFloat(rawTexts[1].replace(',', '.')) : null;
    const dayChg = rawTexts[3] ? parseFloat(rawTexts[3].replace('%', '')) : null;
    const monthChg = rawTexts[4] ? parseFloat(rawTexts[4].replace('%', '')) : null;
    const yearChg = rawTexts[5] ? parseFloat(rawTexts[5].replace('%', '')) : null;
    const dateLabel = rawTexts[6] || null;

    results.push({
      currency: countryConfig.currency,
      country: countryConfig.label,
      maturity: `${maturityYears}Y`,
      label,
      yield: yieldValue,
      dayChgPercent: dayChg,
      monthChgPercent: monthChg,
      yearChgPercent: yearChg,
      date: dateLabel,
      scrapedAt: new Date().toISOString(),
    });
  });

  return results;
}

/**
 * Point d'entrée unique : boucle sur les 8 pays G10, avec pause entre
 * chaque requête (1.5s, évite le rate-limiting), retourne le tableau
 * agrégé des 2Y/5Y/10Y. Ne fait AUCUNE sauvegarde — la route s'en charge.
 */
async function scraperMaturitesG10() {
  const allResults = [];

  for (const country of G10_COUNTRIES) {
    try {
      const html = await fetchCountryBondPage(country.slug);
      const parsed = parseCountryMaturities(html, country);
      allResults.push(...parsed);
    } catch (err) {
      console.error(`[bond-yield-maturities] Echec pour ${country.label}:`, err.message);
    }

    await sleep(1500);
  }

  if (allResults.length === 0) {
    throw new Error('Aucune maturité extraite pour aucun pays — structure HTML probablement changée.');
  }

  return allResults;
}

export { scraperMaturitesG10, fetchCountryBondPage, parseCountryMaturities, G10_COUNTRIES };
