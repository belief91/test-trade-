// scripts/migrer-historique-vers-r2.js
//
// Migre l'historique calendrier DIRECTEMENT dans l'archive R2 unique,
// sans passer par Back4App. Fix definitif au probleme d'import qui
// n'atteignait jamais la bonne base Back4App malgre "Import termine"
// confirme plusieurs fois.
//
// Usage :
//   node scripts/migrer-historique-vers-r2.js chemin/vers/fichier.json          (dry-run)
//   node scripts/migrer-historique-vers-r2.js chemin/vers/fichier.json --confirmer

import fs from "fs";

const CONFIRME = process.argv.includes("--confirmer");
const cheminFichier = process.argv[2];

if (!cheminFichier || cheminFichier === "--confirmer") {
  console.error("Usage : node scripts/migrer-historique-vers-r2.js <chemin-du-json> [--confirmer]");
  process.exit(1);
}

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

function formatDateTexte(dateISO) {
  const [annee, mois, jour] = dateISO.split("-").map(Number);
  const dateObj = new Date(Date.UTC(annee, mois - 1, jour));
  const weekday = dateObj.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const month = dateObj.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `${weekday} ${month} ${jour} ${annee}`;
}

async function migrer() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });

  const { lireArchiveCalendrier, fusionnerDansArchiveCalendrier } = await import("../lib/calendrier-archive-r2.js");

  const brut = fs.readFileSync(cheminFichier, "utf-8");
  const { events } = JSON.parse(brut);

  console.log(`Evenements trouves dans le fichier : ${events.length}`);

  const archiveActuelle = await lireArchiveCalendrier();
  console.log(`Evenements deja presents dans l'archive R2 : ${archiveActuelle.length}`);

  const evenementsConvertis = [];
  let ignores = 0;

  for (const e of events) {
    if (!e.currency || !e.indicator || !e.date) {
      ignores++;
      continue;
    }

    const { dateISO, heureGMT3 } = convertirVersGMT3(e.date, e.time);
    const dateTexte = formatDateTexte(dateISO);

    evenementsConvertis.push({
      date: dateTexte,
      heureGmt3: heureGMT3,
      devise: e.currency,
      evenement: e.indicator,
      reel: e.actual ?? "",
      precedent: e.previous ?? "",
      consensus: e.consensus ?? "",
      prevision: e.forecast ?? "",
      impact: "Fort (3/3)",
    });
  }

  console.log(`Convertis et prets a fusionner : ${evenementsConvertis.length}`);
  console.log(`Ignores (champs manquants) : ${ignores}`);

  if (!CONFIRME) {
    console.log("\n[DRY-RUN] Apercu des 5 premiers evenements a fusionner :");
    evenementsConvertis.slice(0, 5).forEach((e) =>
      console.log(`  ${e.date} ${e.heureGmt3} | ${e.devise} | ${e.evenement} | reel=${e.reel}`)
    );
    console.log(`\nTotal apres fusion (estimation) : jusqu'a ${archiveActuelle.length + evenementsConvertis.length} evenements (moins les doublons)`);
    console.log("\n[DRY-RUN] Aucune ecriture effectuee. Relance avec --confirmer pour appliquer.");
    return;
  }

  const resultat = await fusionnerDansArchiveCalendrier(evenementsConvertis);
  console.log(`\nFusion terminee. Total dans l'archive R2 apres fusion : ${resultat.count} evenements.`);
}

migrer()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur migration :", err);
    process.exit(1);
  });
