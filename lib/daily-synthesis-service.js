// lib/daily-synthesis-service.js
import Parse from "./back4app-server";
import { uploaderVersR2 } from "./r2-upload-service";

const CLASS_NAME = "DailySynthesis";

function dateAujourdhuiMadagascar() {
  const maintenant = new Date();
  const options = { timeZone: "Indian/Antananarivo" };
  const weekday = maintenant.toLocaleDateString("en-US", { ...options, weekday: "long" });
  const month = maintenant.toLocaleDateString("en-US", { ...options, month: "long" });
  const day = parseInt(
    maintenant.toLocaleDateString("en-US", { ...options, day: "numeric" }),
    10
  );
  const year = maintenant.toLocaleDateString("en-US", { ...options, year: "numeric" });
  return `${weekday} ${month} ${day} ${year}`;
}

/**
 * Enregistre une synthèse (quotidienne ou hebdomadaire) dans Back4App
 * ET l'archive dans Cloudflare R2. Upsert par dateTexte+periode — une
 * seule synthèse par jour et par type, jamais de doublon.
 */
export async function enregistrerSynthese(periode, texte) {
  const DailySynthesis = Parse.Object.extend(CLASS_NAME);
  const dateDuJour = dateAujourdhuiMadagascar();

  const query = new Parse.Query(DailySynthesis);
  query.equalTo("dateTexte", dateDuJour);
  query.equalTo("periode", periode);
  let entry = await query.first({ useMasterKey: true });

  if (!entry) {
    entry = new DailySynthesis();
  }

  const cleR2 = `synthese/${periode}/${dateDuJour.replace(/\s+/g, "-")}.json`;

  entry.set("date", new Date());
  entry.set("dateTexte", dateDuJour);
  entry.set("periode", periode); // "quotidien" | "hebdomadaire"
  entry.set("texte", texte);
  entry.set("r2Cle", cleR2);

  const saved = await entry.save(null, { useMasterKey: true });

  // Archive R2 — ne bloque pas l'enregistrement principal si ça échoue
  try {
    await uploaderVersR2(
      cleR2,
      JSON.stringify({ periode, dateTexte: dateDuJour, texte, genereLe: new Date().toISOString() }),
      "application/json"
    );
  } catch (err) {
    console.error("Erreur upload R2 (non bloquant) :", err.message);
  }

  return saved;
}

/**
 * Récupère la synthèse la plus récente d'un type donné, pour affichage
 * dashboard.
 */
export async function recupererDerniereSynthese(periode) {
  const DailySynthesis = Parse.Object.extend(CLASS_NAME);
  const query = new Parse.Query(DailySynthesis);
  query.equalTo("periode", periode);
  query.descending("date");

  return await query.first({ useMasterKey: true });
}

/**
 * Récupère les synthèses quotidiennes des N derniers jours (pour
 * construire le résumé hebdomadaire du samedi).
 */
export async function recupererSynthesesRecentes(nombreDeJours = 6) {
  const DailySynthesis = Parse.Object.extend(CLASS_NAME);
  const query = new Parse.Query(DailySynthesis);
  query.equalTo("periode", "quotidien");
  query.descending("date");
  query.limit(nombreDeJours);

  const resultats = await query.find({ useMasterKey: true });
  return resultats.map((obj) => ({
    date: obj.get("dateTexte"),
    texte: obj.get("texte"),
  }));
}
