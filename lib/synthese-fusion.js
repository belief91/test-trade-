// lib/synthese-fusion.js
//
// Construction du "dossier devise" pour le prompt de fusion journalière.
// Convention : synthese/{module}/{date}.json — UN fichier par module par
// jour, contenant toutes les devises couvertes ce jour-là.
//
// FIX (10/09, décision explicite) : COT, taux et géopo ont une donnée
// fraîche garantie chaque jour ouvrable — pas de fallback pour eux,
// lecture directe du jour uniquement (absent = NON_DISPONIBLE). Seuls
// BC et macro, dépendants d'événements irréguliers (réunion de banque
// centrale, publication calendaire), gardent le fallback à 1-2 entrées
// dans le passé.

import { lireJSONDepuisR2, ecrireJSONDansR2, listerObjetsR2, genererCleSynthese } from "./r2-client";

const JOURS_MAX_FALLBACK = {
  macro: 60,
  bc: 60,
};

const NB_FALLBACK_SOUHAITE = 2;

function formatDateISO(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function ageEnJours(dateSource, dateDuJour) {
  const diffMs = new Date(dateDuJour) - new Date(dateSource);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export async function ecrireSynthese(nomModule, dateStr, donneesParDevise) {
  const cle = genererCleSynthese(nomModule, dateStr);
  await ecrireJSONDansR2(cle, donneesParDevise);
  return cle;
}

async function lireSyntheseDuJour(nomModule, devise, dateStr) {
  const cle = genererCleSynthese(nomModule, dateStr);
  try {
    const data = await lireJSONDepuisR2(cle);
    return data && data[devise] ? data[devise] : null;
  } catch (err) {
    return null;
  }
}

async function listerDatesDisponibles(nomModule) {
  const cles = await listerObjetsR2(`synthese/${nomModule}/`);
  return cles
    .map((cle) => {
      const nomFichier = cle.split("/").pop();
      const dateStr = nomFichier.replace(".json", "");
      return { cle, date: new Date(dateStr), dateStr };
    })
    .filter((c) => !isNaN(c.date.getTime()))
    .sort((a, b) => b.date - a.date);
}

/**
 * BC et macro uniquement : lecture du jour, sinon fallback à 1-2
 * synthèses antérieures dans le plafond de JOURS_MAX_FALLBACK.
 */
async function resoudreAvecFallback(nomModule, devise, dateDuJour) {
  const dateStrJour = formatDateISO(dateDuJour);

  const contenuFrais = await lireSyntheseDuJour(nomModule, devise, dateStrJour);
  if (contenuFrais) {
    return { statut: "FRAIS", entrees: [{ date: dateStrJour, contenu: contenuFrais }] };
  }

  const plafond = JOURS_MAX_FALLBACK[nomModule];
  const toutesLesDates = await listerDatesDisponibles(nomModule);

  const candidats = toutesLesDates
    .filter((c) => c.date < dateDuJour)
    .filter((c) => ageEnJours(c.date, dateDuJour) <= plafond);

  const entrees = [];
  for (const candidat of candidats) {
    if (entrees.length >= NB_FALLBACK_SOUHAITE) break;
    const data = await lireJSONDepuisR2(candidat.cle).catch(() => null);
    if (data && data[devise]) {
      entrees.push({
        date: candidat.dateStr,
        ageJours: ageEnJours(candidat.date, dateDuJour),
        contenu: data[devise],
      });
    }
  }

  if (entrees.length === 0) {
    return { statut: "NON_DISPONIBLE", entrees: [] };
  }
  return { statut: "DERNIER_CONNU", entrees };
}

/**
 * COT et taux uniquement : lecture du jour SEULEMENT, aucun fallback.
 * Une donnée fraîche est garantie chaque jour ouvrable — une absence
 * signifie un vrai problème du jour, pas un jour sans événement.
 */
async function resoudreDirect(nomModule, devise, dateDuJour) {
  const dateStrJour = formatDateISO(dateDuJour);
  const contenu = await lireSyntheseDuJour(nomModule, devise, dateStrJour);

  if (!contenu) {
    return { statut: "NON_DISPONIBLE", entrees: [] };
  }
  return { statut: "FRAIS", entrees: [{ date: dateStrJour, contenu }] };
}

/**
 * Géopolitique : lecture du jour uniquement, extraction de la devise
 * depuis devisesImpactees. Aucun fallback (même logique que
 * resoudreDirect, mais structure de fichier différente — un seul
 * fichier global, pas par devise).
 */
async function resoudreGeopo(devise, dateDuJour) {
  const dateStrJour = formatDateISO(dateDuJour);
  const cle = genererCleSynthese("geopo", dateStrJour);

  const data = await lireJSONDepuisR2(cle).catch(() => null);
  if (!data) {
    return { statut: "NON_DISPONIBLE", entrees: [] };
  }

  const devisesImpactees = data.devisesImpactees || [];
  const entree = devisesImpactees.find((d) => d.devise === devise);
  if (!entree) {
    return { statut: "NON_DISPONIBLE", entrees: [] };
  }

  return {
    statut: "FRAIS",
    entrees: [
      {
        date: dateStrJour,
        contenu: `${entree.direction} — ${entree.mecanisme}`,
      },
    ],
  };
}

export async function buildDossierDevise(devise, dateDuJour = new Date()) {
  const [macro, bc, cot, taux, geopo] = await Promise.all([
    resoudreAvecFallback("macro", devise, dateDuJour),
    resoudreAvecFallback("bc", devise, dateDuJour),
    resoudreDirect("cot", devise, dateDuJour),
    resoudreDirect("taux", devise, dateDuJour),
    resoudreGeopo(devise, dateDuJour),
  ]);

  return {
    devise,
    dateDuJour: formatDateISO(dateDuJour),
    modules: { macro, bc, cot, taux, geopo },
  };
}
