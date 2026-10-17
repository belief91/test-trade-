// lib/bc-state/bc-preuves.js
//
// Preuves par IDENTIFIANTS au lieu de citations a recopier.
//
// Constat (3 runs successifs sur donnees reelles) : demander a un
// modele de recopier une citation a l'identique echoue ~40 % du temps
// (phrases collees, mots oublies, mauvais document), sans jamais
// inventer de fait. Ici le modele ne recopie plus rien : chaque phrase
// du paquet recoit un identifiant ([d3-s17]), l'IA renvoie les
// identifiants qui soutiennent chaque affirmation, et c'est LE CODE qui
// retrouve le texte exact. Une paraphrase devient impossible.
//
// Verifications :
//   1. tout identifiant cite existe dans le paquet
//   2. une affirmation qui nomme un membre s'appuie sur au moins une
//      phrase de SON discours
//   3. une affirmation collective ("plusieurs", "tous", "la majorite"...)
//      s'appuie sur au moins deux documents distincts
//   4. tout membre nomme ailleurs dans l'analyse est etaye par une
//      preuve verifiee issue de son discours
// LIMITE ASSUMEE : on verifie que les phrases citees existent et
// proviennent du bon document, pas qu'elles soutiennent logiquement
// l'affirmation, et on ne detecte pas les omissions.

const QUANTIFICATEURS = /\b(plusieurs|tous|toutes|majorit[eé]|unanim\w*|l'ensemble|chacun)\b/i;

// Locuteur deduit de l'URL d'un discours Fed : .../speech/waller20261008a.htm
export function extraireLocuteur(source) {
  const m = String(source || "").match(/\/speech\/([a-z]+)\d{8}/i);
  return m ? m[1].toLowerCase() : null;
}

function normaliserId(id) {
  return String(id).replace(/[\[\]\s]/g, "").toLowerCase();
}

/**
 * Numerote chaque phrase du paquet. Retourne le paquet a envoyer a l'IA
 * (phrases prefixees par leur identifiant) et l'index qui permettra de
 * retrouver le texte exact.
 *   reference : rs (statement), rp (presse), rm (minutes)
 *   nouveaux documents : d1, d2, ...
 */
export function numeroterPaquet(paquet) {
  const index = new Map(); // idPhrase -> { texte, docId }
  const documents = new Map(); // docId -> { source, categorie, date, locuteur }

  function numeroter(docId, phrases, meta) {
    documents.set(docId, meta);
    return (phrases || []).map((texte, i) => {
      const id = `${docId}-s${i + 1}`;
      index.set(id, { texte, docId });
      return `[${id}] ${texte}`;
    });
  }

  const ref = paquet.reference || {};
  const referenceNumerotee = { ...ref };
  const blocsReference = [
    ["statement", "rs"],
    ["presseConference", "rp"],
    ["minutes", "rm"],
  ];
  for (const [cle, docId] of blocsReference) {
    if (Array.isArray(ref[cle])) {
      referenceNumerotee[cle] = numeroter(docId, ref[cle], {
        source: "reference",
        categorie: cle,
        date: ref.date,
        locuteur: null,
      });
    }
  }

  const newDocuments = (paquet.newDocuments || []).map((doc, i) => {
    const docId = `d${i + 1}`;
    return {
      id: docId,
      categorie: doc.categorie,
      date: doc.date,
      source: doc.source,
      documentFinal: numeroter(docId, doc.documentFinal, {
        source: doc.source,
        categorie: doc.categorie,
        date: doc.date,
        locuteur: extraireLocuteur(doc.source),
      }),
    };
  });

  return {
    paquetNumerote: { ...paquet, reference: referenceNumerotee, newDocuments },
    index,
    documents,
  };
}

/**
 * Verifie les preuves du resultat de l'IA. Format attendu :
 *   preuves: [{ affirmation: "...", ids: ["d3-s17", "d1-s2"] }]
 * Retourne aussi les preuves RESOLUES (texte exact retrouve par le
 * code), a stocker dans bc_state pour audit.
 */
export function verifierPreuves(resultatIA, { index, documents }) {
  const echecs = [];
  const preuvesResolues = [];
  const preuves = resultatIA.preuves;

  if (!Array.isArray(preuves) || preuves.length === 0) {
    return {
      total: 0,
      verifiees: 0,
      echecs: [{ raison: "champ preuves absent ou vide" }],
      preuvesResolues,
    };
  }

  const locuteurs = new Set(
    [...documents.values()].map((d) => d.locuteur).filter(Boolean)
  );

  for (const p of preuves) {
    const affirmation = String(p?.affirmation || "").trim();
    const ids = Array.isArray(p?.ids) ? p.ids.map(normaliserId).filter(Boolean) : [];
    const echecsPreuve = [];

    if (!affirmation) echecsPreuve.push({ affirmation, raison: "affirmation vide" });
    if (ids.length === 0) echecsPreuve.push({ affirmation, raison: "aucun identifiant fourni" });

    const extraits = [];
    for (const id of ids) {
      const phrase = index.get(id);
      if (!phrase) {
        echecsPreuve.push({ affirmation, raison: `identifiant inexistant : ${id}` });
        continue;
      }
      const doc = documents.get(phrase.docId);
      extraits.push({
        id,
        docId: phrase.docId,
        source: doc.source,
        locuteur: doc.locuteur,
        texte: phrase.texte,
      });
    }

    if (echecsPreuve.length === 0) {
      // 2. attribution nominative dans l'affirmation
      for (const nom of locuteurs) {
        if (new RegExp(`\\b${nom}\\b`, "i").test(affirmation) && !extraits.some((e) => e.locuteur === nom)) {
          echecsPreuve.push({
            affirmation,
            raison: `affirmation attribuee a "${nom}" sans aucune phrase de son discours`,
          });
        }
      }
      // 3. affirmation collective
      if (QUANTIFICATEURS.test(affirmation) && new Set(extraits.map((e) => e.docId)).size < 2) {
        echecsPreuve.push({
          affirmation,
          raison: "affirmation collective (plusieurs / tous / majorite...) appuyee par un seul document",
        });
      }
    }

    if (echecsPreuve.length === 0) {
      preuvesResolues.push({ affirmation, extraits });
    } else {
      echecs.push(...echecsPreuve);
    }
  }

  // 4. membre nomme ailleurs dans l'analyse (hors champ preuves)
  const sansPreuves = { ...resultatIA };
  delete sansPreuves.preuves;
  const texteAnalyse = JSON.stringify(sansPreuves);
  for (const nom of locuteurs) {
    if (!new RegExp(`\\b${nom}\\b`, "i").test(texteAnalyse)) continue;
    const etaye = preuvesResolues.some((pr) => pr.extraits.some((e) => e.locuteur === nom));
    if (!etaye) {
      echecs.push({
        raison: `"${nom}" est cite dans l'analyse mais aucune preuve verifiee ne provient de son discours`,
      });
    }
  }

  return {
    total: preuves.length,
    verifiees: preuvesResolues.length,
    echecs,
    preuvesResolues,
  };
}
