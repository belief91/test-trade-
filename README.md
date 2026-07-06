# BELIEFX — Journal de trading (Next.js + Back4App, déployé sur Vercel)

## Setup local

1. `npm install`
2. Crée `.env.local` à la racine avec tes clés Back4App (App Settings > Security & Keys) :

```
NEXT_PUBLIC_PARSE_APP_ID=...
NEXT_PUBLIC_PARSE_JS_KEY=...
NEXT_PUBLIC_PARSE_SERVER_URL=https://parseapi.back4app.com/
```

3. `npm run dev` → http://localhost:3000

⚠️ **Ne commite jamais `.env.local`** — il est dans `.gitignore`. Sur Vercel, configure ces
3 variables dans **Project Settings > Environment Variables**, pas dans le fichier.

## ⚠️ Une seule source de vérité pour Parse

Ce projet initialise Parse dans **`lib/back4app.js`** uniquement, et l'authentification dans
**`lib/auth.js`**. Si un fichier `lib/parse.js` a été ajouté séparément (initialisation Parse
en double), **supprime-le avant de pousser ce zip** — deux appels à `Parse.initialize()` dans
deux modules différents peuvent créer des instances Parse incohérentes entre elles et casser
la session utilisateur de façon difficile à diagnostiquer. Un seul fichier d'init, toujours.

## Authentification

- **`app/login/page.js`** — écran de connexion dédié, seule route publique du site
- **`components/AuthGate.jsx`** — enveloppe toute l'app (branché dans `app/layout.js`) :
  redirige vers `/login` si aucun utilisateur Parse n'est connecté, et redirige vers
  `/dashboard` si un utilisateur déjà connecté essaie d'ouvrir `/login`
- **Pas d'écran d'inscription** (volontaire, usage mono-utilisateur). Pour créer ton compte :
  1. Dashboard Back4App > ton app > **Database** > **Browser**
  2. Classe **`_User`** (créée par défaut par Parse) > **"+ Add row"**
  3. Remplis `username` et `password` → Save
  4. Connecte-toi sur `/login` avec ces identifiants

## Le lien entre l'authentification et l'erreur "File upload by public is disabled"

Cette erreur Back4App apparaît quand une requête (upload de fichier compris) part **sans
session utilisateur active**. Une fois connecté via `/login`, le SDK Parse attache
automatiquement le jeton de session à chaque requête suivante — les uploads sont alors traités
comme faits par un **utilisateur authentifié**, pas par le public.

Ça résout le problème **à condition que** le réglage Back4App (App Settings > Server Settings
> Core Settings > File Upload) soit sur *"Enable for authenticated users"* ou plus permissif —
pas sur *"Disable"* pur et dur. Si l'erreur persiste après connexion, va vérifier ce réglage
précis dans le dashboard Back4App.

## Sécuriser les classes (Class Level Permissions)

Pour chaque classe une fois qu'elle existe (après ta première sauvegarde dans chaque module) :
**Database** > clique sur la classe > icône **⚙️** > **"Class Level Permissions (CLP)"** >
décoche **"Public"** pour Find/Get/Create/Update/Delete, coche uniquement
**"Authenticated Users"**.

Classes concernées : `Trade`, `Plan`, `Goal`, `Broker`, `WeeklyReview`, `ScreenshotEntry`.

## Différences avec un backend Firebase classique

- **Pas de synchronisation temps réel** : Parse (plan gratuit) n'a pas d'équivalent à
  `onSnapshot`. Chaque page recharge ses données à l'ouverture et après chaque
  création/suppression. Deux appareils ouverts simultanément ne se mettent pas à jour l'un
  l'autre automatiquement — il faut rafraîchir.
- **Suppression de fichier limitée côté client** : le SDK Parse ne permet pas de supprimer un
  fichier déjà uploadé sans la Master Key (jamais utilisée côté navigateur, pour la sécurité).
  Effacer une capture retire sa référence visible, mais le fichier reste stocké côté serveur —
  sans impact réel pour un usage solo à faible volume.
- **`createdAt`/`updatedAt`** gérés automatiquement par Parse sur chaque objet.

## Structure des données — modèle hybride (classe `Trade`)

| Champ | Type | Description |
|---|---|---|
| date | string (YYYY-MM-DD) | Date du trade |
| paire | string | Symbole (Forex, indice, matière première, obligation) |
| direction | "long" \| "short" | Sens du trade |
| account | "Funded" \| "Demo" \| "Personal" | Compte utilisé |
| setup | string | Nom du setup utilisé |
| entry, sl, tp, exit | number \| null | Niveaux de prix (optionnels) |
| profitLoss | number \| null | En % si calculé depuis les prix, en $ si saisi manuellement |
| riskReward | number \| null | Ratio R, uniquement en saisie manuelle |
| result | "Win" \| "Loss" \| "Breakeven" \| null | Calculé automatiquement, ou choisi manuellement |
| isManualResult | boolean | true si le résultat a été saisi à la main |
| checklistScore | number \| null | % de respect de la checklist du Plan, figé à la création |
| notes | string | Notes libres / émotions |

Le Trade **ne contient plus de champ screenshot** — les captures sont entièrement détachées
dans leur propre module (voir `ScreenshotEntry` ci-dessous).

**Logique du mode hybride** : "Saisie manuelle" décochée → prix optionnels, résultat calculé
automatiquement si entrée + sortie sont remplis. Cochée → P&L en $ et ratio R:R saisis
directement, aucun calcul.

## Autres classes Parse

- **`Plan`** (document unique) : reglesGenerales, criteresEntree, gestionRisque, checklist `[{id, text}]`
- **`Goal`** : title, targetAmount, currentAmount, priority, profitAllocationPercentage, status
- **`Broker`** : nom, type, identifiant, plateforme, notes — aide-mémoire uniquement, aucune connexion réelle
- **`WeeklyReview`** : weekId, ceQuiAMarche, ceQuiNaPasMarche, ameliorations
- **`ScreenshotEntry`** : date, label, avantUrl/avantPath, apresUrl/apresPath — module
  entièrement indépendant du Journal (`/screenshots`)

## Récapitulatif des modules et routes

| Route | Contenu |
|---|---|
| `/login` | Connexion (seule route publique) |
| `/dashboard` | Win rate jour/semaine/mois, P&L, streak, performance par paire/setup, R:R, **Plan de trading et Calendar en sections repliables intégrées** |
| `/journal` | Saisie hybride prix/manuel, checklist du Plan, import/export CSV |
| `/screenshots` | Paires avant/après indépendantes, upload local, limite de 80 (évince uniquement les paires complètes) |
| `/calculator` | Calculatrice de taille de position, séparée du Dashboard |
| `/goals` | Objectifs avec allocation automatique d'un % des profits manuels gagnants |
| `/review` | Revue hebdomadaire, historique des semaines passées |
| `/brokers` | Notes par compte broker |

## Partage Android direct (Web Share Target)

BELIEFX peut apparaître dans le menu "Partager" d'Android pour recevoir une image directement
depuis la Galerie. ⚠️ **Condition obligatoire** : le site doit être **installé en PWA**
(menu navigateur → "Ajouter à l'écran d'accueil"). Depuis un simple onglet de navigateur,
cette option n'apparaît pas dans le menu de partage — limite du système Android, pas de l'app.
Une image partagée crée automatiquement une nouvelle paire dans `/screenshots` avec cette
capture en "avant".

## Notes sur les calculs

- Streak / win rate par paire-setup / histogramme R:R : basés sur `result` et `riskReward`,
  fiables peu importe le mode de saisie.
- Objectifs : seuls les trades **manuels gagnants** alimentent l'allocation (le mode "basé sur
  le prix" donne un %, pas un $, donc non additionnable).
- Import CSV : colonnes attendues — `date,paire,direction,account,setup,entry,sl,tp,exit,profitLoss,riskReward,result,isManualResult,notes`.

## Déploiement sur Vercel

1. Push ce code sur GitHub
2. Sur vercel.com → **Add New > Project** → importe le repo → Vercel détecte Next.js automatiquement
3. **Avant de déployer**, ajoute les 3 variables d'environnement (`NEXT_PUBLIC_PARSE_APP_ID`,
   `NEXT_PUBLIC_PARSE_JS_KEY`, `NEXT_PUBLIC_PARSE_SERVER_URL`) dans Project Settings >
   Environment Variables
4. Deploy — Vercel gère nativement les routes API Next.js (`app/api/share-target/route.js`),
   aucune configuration supplémentaire type `netlify.toml` n'est nécessaire
