/**
 * bond-yield-curve-service.js  ("COURBE DE TAUX")
 * ------------------------------------------------------------------
 * A placer dans E:\trading-journal\lib\
 *
 * Scraping de https://tradingeconomics.com/bonds — tableau 10Y de
 * TOUTES les régions/pays (contrairement à bond-yield-maturities-
 * service.js qui cible 2Y/5Y/10Y pour 8 devises G10 seulement).
 *
 * Structure confirmée par inspection DevTools (screenshot fourni) :
 *   <table class="table-heatmap" id="bond-XXXXXXX"> (id aléatoire,
 *   ne jamais cibler directement)
 *     <thead><tr><th></th><th>{Région}</th><th>Yield</th>
 *       <th>Chg</th><th>Weekly</th><th>Monthly</th><th>YTD</th>
 *       <th>YoY</th><th>Date</th></tr></thead>
 *     <tbody>
 *       <tr data-symbol="USGG10YR:IND">
 *         <td><div class="flag ..."/></td>
 *         <td class="datatable-item-first"><a href="..."><b>{Pays}</b></a></td>
 *         <td id="p">{yield}</td>
 *         <td id="nch" data-value="{chg}">...</td>   <-- id="nch", PAS "ch"
 *         <td class="datatable-heatmap" data-value="{weekly}">...</td>
 *         <td class="datatable-heatmap" data-value="{monthly}">...</td>
 *         <td class="datatable-heatmap" data-value="{ytd}">...</td>
 *         <td class="datatable-heatmap" data-value="{yoy}">...</td>
 *         <td>{date}</td>
 *       </tr>
 *     </tbody>
 *   </table>
 *
 * ⚠️ BUG CORRIGE ICI : la version précédente utilisait td#ch (inexistant),
 * d'où chgDaily toujours null. Le vrai id est td#nch.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const TE_BONDS_URL = 'https://tradingeconomics.com/bonds';

// Filtre G10 — noms EXACTS tels qu'extraits du HTML (confirmés par le test
// du 22/07/2026 : "United States", "United Kingdom", etc.)
const G10_COUNTRY_NAMES = [
  'United States',
  'Germany',
  'United Kingdom',
  'Japan',
  'Canada',
  'Australia',
  'Switzerland',
  'New Zealand',
];

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchBondsPage() {
  const response = await axios.get(TE_BONDS_URL, {
    headers: REQUEST_HEADERS,
    timeout: 15000,
  });
  return response.data;
}

function parseBondYields(html) {
  const $ = cheerio.load(html);
  const results = [];

  $('table.table-heatmap').each((_, table) => {
    const $table = $(table);
    const region = $table.find('thead th').eq(1).text().trim() || null;

    if (!region) {
      console.warn('[bond-yield-curve] Région introuvable pour une table — structure TE possiblement changée.');
    }

    $table.find('tbody tr[data-symbol]').each((__, row) => {
      const $row = $(row);
      const symbol = $row.attr('data-symbol') || null;

      const $countryLink = $row.find('td.datatable-item-first a');
      const country = $countryLink.find('b').text().trim() || $countryLink.text().trim() || null;
      const url = $countryLink.attr('href') || null;

      const yieldText = $row.find('td#p').text().trim();
      const yieldValue = yieldText ? parseFloat(yieldText.replace(',', '.')) : null;

      // BUG CORRIGE : id="nch", pas "ch" (confirmé par ton inspection DevTools)
      const $chgCell = $row.find('td#nch');
      const chgDailyRaw = $chgCell.attr('data-value');
      const chgDaily = chgDailyRaw !== undefined ? parseFloat(chgDailyRaw) : null;

      const heatmapCells = $row.find('td.datatable-heatmap');
      const getHeatmapValue = (index) => {
        const el = heatmapCells.eq(index);
        const val = el.attr('data-value');
        return val !== undefined ? parseFloat(val) : null;
      };

      const weekly = getHeatmapValue(0);
      const monthly = getHeatmapValue(1);
      const ytd = getHeatmapValue(2);
      const yoy = getHeatmapValue(3);

      const dateText = $row.find('td').last().text().trim() || null;

      results.push({
        symbol,
        country,
        region,
        url,
        yield: yieldValue,
        chgDaily,
        weekly,
        monthly,
        ytd,
        yoy,
        date: dateText,
        scrapedAt: new Date().toISOString(),
      });
    });
  });

  return results;
}

/**
 * Point d'entrée unique : fetch + parse. Pas de sauvegarde ici —
 * gérée par la route (app/api/bond-yield-curve/route.js).
 */
async function scraperCourbeDeTaux() {
  const html = await fetchBondsPage();
  const allResults = parseBondYields(html);

  // Filtre G10 uniquement (la page /bonds liste ~77 pays au total)
  const results = allResults.filter((item) => G10_COUNTRY_NAMES.includes(item.country));

  if (results.length === 0) {
    throw new Error(
      'Aucune donnée G10 extraite — structure HTML TE probablement changée, ou blocage WAF/IP.'
    );
  }

  return results;
}

export { fetchBondsPage, parseBondYields, scraperCourbeDeTaux };
