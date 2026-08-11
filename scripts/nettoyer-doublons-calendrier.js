// scripts/nettoyer-doublons-calendrier.js
//
// FIX : ajout du chargement explicite de .env.local. Exécuté via
// "node scripts/..." directement (hors Next.js), ce script ne bénéficiait
// pas de l'injection automatique des variables d'environnement que
// Next.js fait en dev/build — d'où "Cannot use the Master Key, it has
// not been provided" malgré une config Vercel/  .env.local par ailleurs
// correcte. Nécessite le package "dotenv" (npm install dotenv si absent).
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

// FIX v2 : le premier fix (ajout de dotenv) ne suffisait pas. Cause
// réelle : en ES modules, TOUS les imports statiques sont hissés en haut
// du fichier et exécutés avant le reste du code, même écrits après
// dotenv.config(). Donc back4app-server.js (et son Parse.initialize())
// s'exécutait AVANT que dotenv.config() ait chargé .env.local — la
// Master Key était donc encore undefined au moment critique. Fix :
// import dynamique de back4app-server.js APRÈS dotenv.config(), qui
// n'est pas hissé et respecte donc l'ordre réel d'exécution.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const { default: Parse } = await import("../lib/back4app-server.js");

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
