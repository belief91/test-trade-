// scripts/importer-historique-banque-centrale.js
//
// Importe un historique calendrier économique (format Trading Economics,
// fourni manuellement) dans Back4App CentralBankCalendar — comble le
// manque de profondeur historique qui limite le narratif macro du
// consolidateur (macro-consolidator-service.js), lequel a besoin de
// publications passées pour construire le contexte "confirm_with" par
// famille d'indicateurs.
//
// Conversions appliquées, car le fichier source est en UTC et au format
// date "YYYY-MM-DD", alors que CentralBankCalendar attend du GMT+3 et un
// format texte "Weekday Month D YYYY" (même convention que le scraper
// TradingEconomics existant et reconnaissance-service.js) :
//   1. Heure UTC -> GMT+3 (+3h, avec bascule de jour si nécessaire)
//   2. Date -> texte anglais long ("Wednesday July 29 2026")
//
// Dédoublonnage : même logique que upsertVersBack4App (devise+evenement+date),
// donc rejouable sans risque de créer des doublons.
//
// Usage :
//   node scripts/importer-historique-banque-centrale.js chemin/vers/fichier.json          (dry-run)
//   node scripts/importer-historique-banque-centrale.js chemin/vers/fichier.json --confirmer   (écrit pour de vrai)

import dotenv from "dotenv";
import fs from "fs";

dotenv.config({ path: ".env.local" });

const { default: Parse } = await import("../lib/back4app-server.js");

const CONFIRME = process.argv.includes("--confirmer");
const cheminFichier = process.argv[2];

if (!cheminFichier || cheminFichier === "--confirmer") {
  console.error("Usage : node scripts/importer-historique-banque-centrale.js <chemin-du-json> [--confirmer]");
  process.exit(1);
}

/**
 * Convertit une date "YYYY-MM-DD" + heure "HH:MM" (UTC) vers un objet
 * { dateISO_GMT3, heureGMT3 } en GMT+3. Gère la bascule de jour si +3h
 * fait passer l'heure au lendemain (ex: 22:30 UTC -> 01:30 GMT+3 j+1).
 * Si timeStr est null (événement sans heure précise, ex: rapport BoC),
 * la date n'est pas décalée (on ne peut pas savoir si l'heure UTC
 * originale était proche de minuit).
 */
function convertirVersGMT3(dateStr, timeStr) {
  if (!timeStr) {
    return { dateISO: dateStr, heureGMT3: "" };
  }
  const [annee, mois, jour] = dateStr.split("-").map(Number);
  const [h, m] = timeStr.split(":").map(Number);
  const dateUTC = new Date(Date.UTC(annee, mois - 1, jour, h, m));
  const dateGMT3 = new Date(dateUTC.getTime() + 3 * 60 * 60 * 1000);

  const yyyy = dateGMT3.getUTCFullYear();
  const mm = String(dateGMT3.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dateGMT3.getUTCDate()).padStart(2, "0");
  const hh = String(dateGMT3.getUTCHours()).padStart(2, "0");
  const mi = String(dateGMT3.getUTCMinutes()).padStart(2, "0");

  return { dateISO: `${yyyy}-${mm}-${dd}`, heureGMT3: `${hh}:${mi}` };
}

/**
 * Convertit une date ISO "YYYY-MM-DD" vers le format texte attendu par
 * CentralBankCalendar : "Weekday Month D YYYY" (ex: "Wednesday July 29 2026").
 */
function formatDateTexte(dateISO) {
  const [annee, mois, jour] = dateISO.split("-").map(Number);
  const dateObj = new Date(Date.UTC(annee, mois - 1, jour));
  const weekday = dateObj.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const month = dateObj.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `${weekday} ${month} ${jour} ${annee}`;
}

async function importer() {
  const brut = fs.readFileSync(cheminFichier, "utf-8");
  const { events } = JSON.parse(brut);

  console.log(`Événements trouvés dans le fichier : ${events.length}`);

  const CentralBankCalendar = Parse.Object.extend("CentralBankCalendar");

  let nouveaux = 0;
  let misAJour = 0;
  let ignores = 0;

  for (const e of events) {
    if (!e.currency || !e.indicator || !e.date) {
      ignores++;
      continue;
    }

    const { dateISO, heureGMT3 } = convertirVersGMT3(e.date, e.time);
    const dateTexte = formatDateTexte(dateISO);

    const requete = new Parse.Query(CentralBankCalendar);
    requete.equalTo("devise", e.currency);
    requete.equalTo("evenement", e.indicator);
    requete.equalTo("date", dateTexte);
    const existant = await requete.first({ useMasterKey: true });

    if (!CONFIRME) {
      console.log(
        `  [DRY-RUN] ${existant ? "MAJ" : "NOUVEAU"} — ${dateTexte} ${heureGMT3} | ${e.currency} | ${e.indicator} | reel=${e.actual}`
      );
      if (existant) misAJour++; else nouveaux++;
      continue;
    }

    const obj = existant || new CentralBankCalendar();
    obj.set("date", dateTexte);
    obj.set("heureGmt3", heureGMT3);
    obj.set("devise", e.currency);
    obj.set("evenement", e.indicator);
    obj.set("reel", e.actual ?? "");
    obj.set("precedent", e.previous ?? "");
    obj.set("consensus", e.consensus ?? "");
    obj.set("prevision", e.forecast ?? "");
    obj.set("impact", "Fort (3/3)"); // dataset déjà pré-filtré, même convention que le scraper

    await obj.save(null, { useMasterKey: true });
    if (existant) misAJour++; else nouveaux++;
  }

  console.log(`\nNouveaux : ${nouveaux}`);
  console.log(`Mis à jour : ${misAJour}`);
  console.log(`Ignorés (champs manquants) : ${ignores}`);

  if (!CONFIRME) {
    console.log("\n[DRY-RUN] Aucune écriture effectuée. Relance avec --confirmer pour appliquer.");
  } else {
    console.log("\nImport terminé.");
  }
}

importer()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur import :", err);
    process.exit(1);
  });
