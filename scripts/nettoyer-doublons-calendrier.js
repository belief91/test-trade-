// scripts/nettoyer-doublons-calendrier.js
//
// Script PONCTUEL — à exécuter une seule fois pour nettoyer les doublons
// existants dans CentralBankCalendar (créés avant le fix de upsertVersBack4App
// dans app/api/central-bank-calendar/route.js).
//
// Logique : regroupe les événements par clé (devise + evenement + date),
// garde le plus récent (updatedAt le plus grand — donc celui avec les
// données les plus à jour, ex: "reel" rempli après publication), supprime
// les autres.
//
// Usage :
//   node scripts/nettoyer-doublons-calendrier.js         (dry-run, n'efface rien)
//   node scripts/nettoyer-doublons-calendrier.js --confirmer  (efface pour de vrai)

import Parse from "../lib/back4app-server.js";

const CONFIRME = process.argv.includes("--confirmer");

async function nettoyer() {
  const CentralBankCalendar = Parse.Object.extend("CentralBankCalendar");
  const requete = new Parse.Query(CentralBankCalendar);
  requete.limit(10000); // au-delà, il faudrait paginer — pas nécessaire au volume actuel
  requete.ascending("updatedAt");

  const tous = await requete.find({ useMasterKey: true });
  console.log(`Total lignes trouvées : ${tous.length}`);

  const groupes = new Map();

  for (const obj of tous) {
    const cle = `${obj.get("devise")}|${obj.get("evenement")}|${obj.get("date")}`;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(obj);
  }

  const aSupprimer = [];
  let groupesAvecDoublons = 0;

  for (const [cle, objets] of groupes) {
    if (objets.length <= 1) continue;
    groupesAvecDoublons++;
    // objets est trié par updatedAt ascendant (requête ascending("updatedAt"))
    // on garde le dernier (le plus récent), on supprime les autres
    const aGarder = objets[objets.length - 1];
    const doublons = objets.slice(0, -1);
    aSupprimer.push(...doublons);
    console.log(
      `  ${cle} -> ${objets.length} lignes, garde ${aGarder.id}, supprime ${doublons.length} doublon(s)`
    );
  }

  console.log(`\nGroupes uniques : ${groupes.size}`);
  console.log(`Groupes avec doublons : ${groupesAvecDoublons}`);
  console.log(`Lignes à supprimer : ${aSupprimer.length}`);

  if (!CONFIRME) {
    console.log(
      "\n[DRY-RUN] Aucune suppression effectuée. Relance avec --confirmer pour appliquer."
    );
    return;
  }

  if (aSupprimer.length === 0) {
    console.log("\nRien à supprimer.");
    return;
  }

  await Parse.Object.destroyAll(aSupprimer, { useMasterKey: true });
  console.log(`\n${aSupprimer.length} doublon(s) supprimé(s).`);
}

nettoyer()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur nettoyage :", err);
    process.exit(1);
  });
