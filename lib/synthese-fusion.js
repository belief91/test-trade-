// lib/synthese-fusion.js
// Construction du "dossier devise" pour le prompt de fusion journalière.
//
// Convention de stockage : synthese/{module}/{date}.json — UN fichier par
// module par jour, contenant toutes les devises couvertes ce jour-là :
//   { "EUR": { narratif: "...", biais: "...", conviction: "..." }, "GBP": {...}, ... }
// (même logique que les fichiers raw/{date}/{module}.json existants : une
// seule clé date par module, jamais un fichier par devise.)
//
// Statuts renvoyés par devise/module :
//   FRAIS           -> synthèse du jour trouvée
//   DERNIER_CONNU   -> 1 ou 2 synthèses antérieures trouvées, dans le plafond
//   NON_DISPONIBLE  -> rien d'utilisable, jamais inventé
//
// Géopolitique : cas à part, temps réel uniquement, aucun fallback
// (un choc non renouvelé perd sa valeur de signal rapidement).

const {
  lireJSONDepuisR2,
  ecrireJSONDansR2,
  listerObjetsR2,
  genererCleSynthese,
} = require("./r2-client");

const JOURS_MAX_FALLBACK = {
  macro: 60,
  bc: 60,
  cot: 14,
  taux: 10,
  // geopo volontairement absent : pas de fallback, voir resoudreGeopo()
};

const NB_FALLBACK_SOUHAITE = 2; // on essaie d'abord 2, sinon on redescend à 1

function formatDateISO(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function ageEnJours(dateSource, dateDuJour) {
  const diffMs = new Date(dateDuJour) - new Date(dateSource);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Écrit la synthèse du jour pour un module (toutes devises couvertes ce
 * jour-là dans un seul fichier, cf. en-tête du fichier).
 * @param {string} nomModule - "macro" | "bc" | "cot" | "taux" | "geopo"
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {object} donneesParDevise - ex: { EUR: {...}, GBP: {...} } ou, pour
 *   geopo, { devisesImpactees: [{devise, direction, mecanisme}, ...] }
 */
async function ecrireSynthese(nomModule, dateStr, donneesParDevise) {
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
    return null; // fichier absent aujourd'hui pour ce module — normal, pas une erreur
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

async function resoudreModule(nomModule, devise, dateDuJour) {
  const dateStrJour = formatDateISO(dateDuJour);

  // 1. Synthèse du jour
  const contenuFrais = await lireSyntheseDuJour(nomModule, devise, dateStrJour);
  if (contenuFrais) {
    return { statut: "FRAIS", entrees: [{ date: dateStrJour, contenu: contenuFrais }] };
  }

  // 2. Fallback : on essaie d'abord les 2 dernières synthèses disponibles
  //    qui couvrent réellement cette devise (un module peut avoir tourné
  //    un jour donné sans inclure toutes les devises, ex: BC par banque).
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
 * Géopolitique : lit uniquement le fichier du jour. Si absent, ou si la
 * devise demandée n'apparaît pas dans devisesImpactees -> NON_DISPONIBLE.
 * Aucun appel à listerDatesDisponibles ici : c'est la règle confirmée
 * (pas de fallback sur un ancien choc géopolitique).
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

/**
 * Construit le dossier devise complet (5 slots) pour le prompt de fusion
 * journalière. N'invente jamais un module absent.
 */
async function buildDossierDevise(devise, dateDuJour = new Date()) {
  const [macro, bc, cot, taux, geopo] = await Promise.all([
    resoudreModule("macro", devise, dateDuJour),
    resoudreModule("bc", devise, dateDuJour),
    resoudreModule("cot", devise, dateDuJour),
    resoudreModule("taux", devise, dateDuJour),
    resoudreGeopo(devise, dateDuJour),
  ]);

  return {
    devise,
    dateDuJour: formatDateISO(dateDuJour),
    modules: { macro, bc, cot, taux, geopo },
  };
}

module.exports = { buildDossierDevise, ecrireSynthese };
