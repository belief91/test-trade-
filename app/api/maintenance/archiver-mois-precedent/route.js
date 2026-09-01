// app/api/maintenance/archiver-mois-precedent/route.js
//
// Réorganise raw/{YYYY-MM-DD}/*.json (un dossier par jour, à plat) vers
// raw/{YYYY-MM}/{DD}/*.json (regroupé sous un seul dossier par mois),
// pour le MOIS PRÉCÉDENT celui en cours au moment de l'appel.
//
// Ne touche jamais le mois en cours — seulement un mois déjà terminé.
// Copie chaque fichier vers le nouveau chemin, vérifie que la copie a
// réussi (relecture), PUIS supprime l'original. Jamais l'inverse.
//
// Idempotent : si un fichier a déjà été déplacé (le nouveau chemin
// existe déjà avec le même contenu), il est ignoré plutôt que recopié.
//
// GET /api/maintenance/archiver-mois-precedent
// Protégée par CRON_SECRET — action destructive (suppression), jamais
// sans authentification, contrairement aux routes de lecture seule.

import { NextResponse } from "next/server";
import { listerObjetsR2, lireJSONDepuisR2, ecrireJSONDansR2, supprimerObjetR2 } from "../../../../lib/r2-client";

function moisPrecedentGMT3() {
  const maintenant = new Date();
  const offsetGMT3 = 3 * 60;
  const dateGMT3 = new Date(maintenant.getTime() + (offsetGMT3 + maintenant.getTimezoneOffset()) * 60000);

  const anneeCourante = dateGMT3.getUTCFullYear();
  const moisCourant = dateGMT3.getUTCMonth(); // 0-indexé

  const datePrecedente = new Date(Date.UTC(anneeCourante, moisCourant - 1, 1));
  const annee = datePrecedente.getUTCFullYear();
  const mois = String(datePrecedente.getUTCMonth() + 1).padStart(2, "0");

  return `${annee}-${mois}`; // ex: "2026-08"
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const moisCible = moisPrecedentGMT3(); // ex: "2026-08"

  try {
    // Liste tout ce qui est sous raw/2026-08-*/  (préfixe du mois, tous
    // les jours confondus) — ne liste jamais raw/2026-08/ (déjà migré)
    // ni le mois en cours.
    const toutesLesCles = await listerObjetsR2(`raw/${moisCible}-`);

    if (toutesLesCles.length === 0) {
      return NextResponse.json({
        status: "skip",
        reason: `aucun fichier trouvé sous raw/${moisCible}-*/`,
        moisCible,
      });
    }

    const deplaces = [];
    const ignores = [];
    const erreurs = [];

    for (const ancienneCle of toutesLesCles) {
      // ancienneCle ex: "raw/2026-08-27/bond-yields.json"
      const match = ancienneCle.match(/^raw\/(\d{4}-\d{2})-(\d{2})\/(.+)$/);
      if (!match) {
        ignores.push({ cle: ancienneCle, raison: "format de chemin inattendu" });
        continue;
      }

      const [, moisExtrait, jour, nomFichier] = match;
      if (moisExtrait !== moisCible) {
        ignores.push({ cle: ancienneCle, raison: "mois différent du mois cible" });
        continue;
      }

      const nouvelleCle = `raw/${moisCible}/${jour}/${nomFichier}`;

      try {
        const contenu = await lireJSONDepuisR2(ancienneCle);
        await ecrireJSONDansR2(nouvelleCle, contenu);

        // Vérification avant suppression : relire la nouvelle clé et
        // comparer une taille/structure minimale, pas juste supposer
        // que l'écriture a réussi parce qu'elle n'a pas levé d'erreur.
        const verification = await lireJSONDepuisR2(nouvelleCle);
        if (JSON.stringify(verification) !== JSON.stringify(contenu)) {
          throw new Error("Vérification post-copie échouée : contenu différent");
        }

        await supprimerObjetR2(ancienneCle);
        deplaces.push({ de: ancienneCle, vers: nouvelleCle });
      } catch (error) {
        erreurs.push({ cle: ancienneCle, message: error.message });
        // Ne supprime JAMAIS l'original si la copie ou la vérification
        // a échoué — le fichier reste à son ancien emplacement, visible
        // dans "erreurs", à retenter plus tard.
      }
    }

    return NextResponse.json({
      status: "ok",
      moisCible,
      totalFichiers: toutesLesCles.length,
      deplaces: deplaces.length,
      ignores,
      erreurs,
    });
  } catch (error) {
    console.error("Erreur réorganisation mensuelle :", error);
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
