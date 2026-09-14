// lib/synthese-fusion.js
//
// Construction du "dossier devise" pour le prompt de fusion journalière.
// Convention : synthese/{module}/{date}.json — UN fichier par module par
// jour, contenant toutes les devises couvertes ce jour-là.
//
// Fallback (FRAIS/DERNIER_CONNU) réservé à BC et macro (événements
// irréguliers). COT et taux : lecture directe du jour, aucun fallback
// (données garanties chaque jour ouvrable). Géopolitique : temps réel
// uniquement, aucun fallback.

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
 * FIX (10/09) — primitive partagée : renvoie le FICHIER ENTIER (toutes
 * devises) le plus récent disponible pour un module, frais ou de secours,
 * sans filtrer sur une devise. Utilisée par resoudreAvecFallback()
 * ci-dessous (qui filtre ensuite sur UNE devise pour la fusion) ET par
 * assemblage-manuel-service.js (qui a besoin du fichier complet pour la
 * méthode Claude chat gratuite).
 */
export async function obtenirDernierFichierModule(nomModule, dateDuJour = new Date()) {
  const dateStrJour = formatDateISO(dateDuJour);
  const cleDuJour = genererCleSynthese(nomModule, dateStrJour);

  const contenuDuJour = await lireJSONDepuisR2(cleDuJour).catch(() => null);
  if (contenuDuJour) {
    return { statut: "FRAIS", date: dateStrJour, ageJours: 0, contenu: contenuDuJour };
  }

  const plafond = JOURS_MAX_FALLBACK[nomModule];
  if (plafond === undefined) {
    // COT/taux/géopo : pas de fallback fichier entier, cf. resoudreDirect/resoudreGeopo
    return { statut: "NON_DISPONIBLE", date: null, ageJours: null, contenu: null };
  }

  const toutesLesDates = await listerDatesDisponibles(nomModule);
  const candidat = toutesLesDates
    .filter((c) => c.date < dateDuJour)
    .filter((c) => ageEnJours(c.date, dateDuJour) <= plafond)[0];

  if (!candidat) {
    return { statut: "NON_DISPONIBLE", date: null, ageJours: null, contenu: null };
  }

  const contenu = await lireJSONDepuisR2(candidat.cle).catch(() => null);
  if (!contenu) {
    return { statut: "NON_DISPONIBLE", date: null, ageJours: null, contenu: null };
  }

  return {
    statut: "DERNIER_CONNU",
    date: candidat.dateStr,
    ageJours: ageEnJours(candidat.date, dateDuJour),
    contenu,
  };
}

/**
 * BC et macro uniquement : lecture du jour, sinon fallback à 1-2
 * synthèses antérieures, filtré sur UNE devise (pour buildDossierDevise).
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

async function resoudreDirect(nomModule, devise, dateDuJour) {
  const dateStrJour = formatDateISO(dateDuJour);
  const contenu = await lireSyntheseDuJour(nomModule, devise, dateStrJour);

  if (!contenu) {
    return { statut: "NON_DISPONIBLE", entrees: [] };
  }
  return { statut: "FRAIS", entrees: [{ date: dateStrJour, contenu }] };
}

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
