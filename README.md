# Rappel — cartes mémoire à répétition espacée

Application web progressive (PWA) de cartes mémoire, inspirée d'Anki mais plus simple et plus moderne.
Interface en français, mode sombre, pensée pour le mobile d'abord. Fonctionne **hors ligne** et s'installe
sur iPhone, Android et PC. Les données vivent sur l'appareil (IndexedDB) ; un **compte facultatif** (Firebase) les
synchronise entre PC et téléphone.

## Fonctionnalités

- **Modules prêts à réviser** (écran « Modules ») : AWS Cloud Practitioner et Solutions Architect Associate, Azure AZ-900 et AZ-104, TOEIC (anglais professionnel),
  Google Cloud Digital Leader, Code de la route voiture (avec panneaux dessinés) et moto, CCNA, Linux Essentials, CompTIA Security+,
  ITIL Foundation, Scrum PSM I, Premiers secours — environ 2 600 cartes, un sous-paquet par chapitre du programme. Rangés en
  8 catégories (du plus demandé au moins demandé : permis, puis langues), filtrables par niveau, « Mes modules » / « À découvrir » et par recherche ; ajout du module entier ou chapitre
  par chapitre, avancement par module et par chapitre, retrait en un geste. Détails plus bas.
- **Paquets et sous-paquets** (arbre repliable), **tags**, **recherche** (`mot`, `"phrase"`, `tag:cisco`, `deck:réseau`, `type:cloze`).
- **Cartes** : recto/verso, recto/verso + inverse, texte à trous (`{{c1::réponse::indice}}`), Markdown, blocs de code avec bouton « Copier », images (import ou collage).
- **Révision** : recto → réponse → 4 boutons (À revoir, Difficile, Bien, Facile) avec l'intervalle suivant affiché. Clavier sur PC, balayage sur mobile, annulation de la dernière réponse.
- **Planification FSRS** (bibliothèque `ts-fsrs`), limites quotidiennes de nouvelles cartes et de révisions, rétention visée réglable.
- **Mode « taper la réponse »** : compare la saisie à la bonne réponse (tolérant à la casse/accents, détecte « presque », affiche les différences).
- **Import CSV** (`recto;verso;tags`), **sauvegarde/restauration JSON** complète, **import de paquets Anki (.apkg)**.
- **Statistiques** : à revoir aujourd'hui, série de jours, taux de réussite, calendrier d'activité, prévision sur 30 jours.
- **Sécurité des données** : stockage persistant demandé au navigateur (état affiché dans les Réglages), rappel de sauvegarde régulier
  (réglable), confirmation avant toute suppression, **sauvegarde automatique avant chaque import ou restauration** (5 dernières
  gardées, restaurables en un clic, dans une base séparée).
- **Compte et synchronisation (facultatif)** : Réglages → « Compte et synchronisation ». Même compte sur le PC et le
  téléphone = mêmes paquets, cartes, révisions, images et réglages. Synchro automatique à l'ouverture, au retour sur
  l'onglet, au retour du réseau et toutes les 5 min ; l'app reste utilisable hors ligne. Détails plus bas.
- **Accessibilité** : navigation complète au clavier, lien d'évitement, dialogues à focus piégé, contrastes WCAG AA vérifiés, compatible lecteurs d'écran, respecte « réduire les animations ».
- **Robustesse** : messages d'erreur en français, écran dédié si le stockage local est bloqué, notation instantanée (écriture en arrière-plan).

### Raccourcis clavier (révision)

| Touche | Action |
|---|---|
| `Espace` / `Entrée` | Afficher la réponse ; ensuite « Bien » (ou la note suggérée en mode « taper ») |
| `1` `2` `3` `4` | À revoir / Difficile / Bien / Facile |
| `Z` ou `U` ou `Retour arrière` | Annuler la dernière réponse |
| `Échap` | Quitter la séance |

### Gestes (mobile)

Après avoir affiché la réponse : balayage vers la **gauche** = À revoir, vers la **droite** = Bien.
Difficile et Facile se choisissent avec les boutons. Toucher la carte affiche la réponse.

## Lancer le projet

Prérequis : Node.js 20+ (testé avec Node 24).

```bash
npm install
npm run dev        # serveur de développement : http://localhost:5173
npm test           # tests unitaires (Vitest, ~140 tests)
npm run test:e2e   # tests de bout en bout (Playwright : desktop + émulation iPhone + Android)
npm run build      # vérification TypeScript + build de production dans dist/
npm run preview    # sert le build (nécessaire pour tester le mode hors ligne / l'installation)
npm run icons      # régénère les icônes PWA (public/)
node scripts/serve-gh.mjs   # construit « comme GitHub Pages » (base /rappel/) et le sert sur :4174
```

> Le service worker (hors ligne, installation) n'est actif que sur le **build** (`npm run build` puis `npm run preview`) et en HTTPS ou sur `localhost`.

> **Windows** : `npm test` et `npm run test:e2e` passent par `scripts/run-tool.mjs`, qui corrige automatiquement
> la casse du chemin (`c:\...` / `C:\...`). Pour lancer Vitest ou Playwright directement, utilisez le chemin à la casse réelle.

### Tests de bout en bout

```bash
npx playwright install chromium     # une seule fois : télécharge le navigateur de test
npm run test:e2e                    # tout : construit l'app puis lance ~115 tests (≈ 2 min)
npm run test:e2e -- study           # un seul fichier (cards, study, import-export, offline, a11y, perf, safety-polish, ghpages)
npm run test:e2e -- --project=iphone
```

Ils couvrent : création de cartes, révision au clavier et au balayage tactile, mode « taper la réponse », imports CSV / JSON / `.apkg`,
export et restauration, **hors ligne avec coupure réseau réelle**, accessibilité (axe-core + clavier), performances sur 10 000 cartes,
et le build GitHub Pages (chemins de base). Les profils iPhone et Android sont des **émulations sur Chromium** : ils ne remplacent pas
un essai sur un vrai téléphone.

## Installer l'application

Il faut d'abord que l'app soit servie en **HTTPS** (voir « Déployer » ci-dessous), sauf pour un essai sur `localhost`.

### iPhone / iPad (Safari)

1. Ouvrez l'adresse de l'app dans **Safari** (pas dans une autre application).
2. Touchez **Partager** (carré avec une flèche) → **Sur l'écran d'accueil** → **Ajouter**.
3. Lancez Rappel depuis l'icône. Les données d'une app installée sur l'écran d'accueil sont conservées ; dans un simple onglet Safari, iOS peut les effacer après quelques jours sans visite. **Installez l'app et exportez régulièrement une sauvegarde.**

### Android (Chrome)

1. Ouvrez l'adresse dans **Chrome**.
2. Menu ⋮ → **Installer l'application** (ou **Ajouter à l'écran d'accueil**).

### PC (Chrome, Edge)

1. Ouvrez l'adresse ; cliquez sur l'icône d'installation à droite de la barre d'adresse (ou menu → **Installer Rappel**).
2. L'app s'ouvre dans sa propre fenêtre et s'ajoute au menu Démarrer / Applications.

## Déployer gratuitement en ligne

L'app est 100 % statique (dossier `dist/`) et utilise un routage par `#`, donc aucun réglage de redirection n'est nécessaire.

### Option A — GitHub Pages (workflow fourni)

1. Poussez le dépôt sur GitHub (branche `main`).
2. Dépôt → **Settings → Pages → Source : GitHub Actions**.
3. Le workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) construit (avec `BASE_PATH=/<nom-du-dépôt>/`) et publie à chaque push. L'app est alors à `https://<utilisateur>.github.io/<dépôt>/`.
4. **Vérifier avant de pousser** : `node scripts/serve-gh.mjs` construit avec la base `/rappel/` et sert le résultat sur <http://localhost:4174/rappel/> ;
   `npm run test:e2e -- ghpages` contrôle automatiquement les chemins (assets, manifeste, icônes, service worker, hors ligne).
   Si votre dépôt ne s'appelle pas `rappel`, lancez `BASE_PATH=/mon-depot/ node scripts/serve-gh.mjs` (en PowerShell : `$env:BASE_PATH='/mon-depot/'; node scripts/serve-gh.mjs`).

### Option B — Netlify / Cloudflare Pages / Vercel

Connectez le dépôt, puis : commande de build `npm run build`, dossier de sortie `dist`. Rien d'autre (la base `/` par défaut convient).

### Option C — Glisser-déposer

`npm run build`, puis déposez le dossier `dist/` sur [Netlify Drop](https://app.netlify.com/drop).

## Compte et synchronisation (Firebase)

La synchro utilise Firebase (offre gratuite Spark) : **Authentication** (e-mail + mot de passe) et **Cloud Firestore**
(région Europe). Chaque utilisateur ne peut lire et écrire que `users/{son uid}/…` (règles Firestore).

- **Configuration** : coller l'objet `firebaseConfig` de la console Firebase (Paramètres du projet → Vos applications)
  dans `src/lib/firebase-config.ts`. Sans configuration, la section du compte est masquée et l'app fonctionne comme avant.
  La clé `apiKey` d'une app web Firebase n'est pas un secret (elle identifie le projet) : la sécurité repose sur les
  règles Firestore. GitHub peut quand même envoyer une alerte « Google API Key » : c'est attendu.
- **Principe** : chaque enregistrement porte une date de modification locale (`_u`) ; la synchro envoie ce qui a changé
  depuis le dernier envoi, reçoit ce qui a changé ailleurs, et en cas de conflit **la modification la plus récente gagne**
  (par enregistrement). Les suppressions sont transmises (table locale `tombstones`).
- **Limites** : « Tout remplacer » (restauration) ou « Tout effacer » sur un appareil synchronisé ne supprime pas les
  données du compte ; une image de plus de ~900 Ko n'est pas synchronisée. **Importez vos cartes sur un seul appareil**
  puis laissez la synchro les copier ailleurs, sinon vous aurez des doublons.

## Modules prêts à réviser

Écran **Modules** (dans la navigation) : chaque module couvre le programme officiel de l'examen visé, chapitre par chapitre,
avec un chapitre « L'examen » (format, note requise, pièges). « Ajouter » crée un paquet racine et un sous-paquet par chapitre ;
les cartes arrivent dans l'ordre du programme, au rythme du réglage « nouvelles cartes par jour ».

| Catégorie | Modules (version visée, niveau) |
|---|---|
| Permis de conduire | Code de la route voiture (ETG : 10 thèmes officiels + 60 panneaux dessinés, badge « Le plus demandé »), Code de la route moto (ETM) |
| Langues | TOEIC (Listening and Reading / 4 compétences, intermédiaire) : format de l'examen, vocabulaire professionnel par thème, faux amis, grammaire de la partie 5, verbes à particule |
| Cloud | AWS Cloud Practitioner (CLF-C02, débutant), AWS Solutions Architect Associate (SAA-C03, intermédiaire), Azure Fundamentals (AZ-900, débutant), Azure Administrator (AZ-104, intermédiaire), Google Cloud Digital Leader (programme d'août 2026, débutant) |
| Réseau | CCNA 200-301 (cartes S01 à S18, intermédiaire) |
| Systèmes | Linux Essentials (010-160, débutant) |
| Cybersécurité | CompTIA Security+ (SY0-701 / SY0-801, intermédiaire) |
| Gestion de projet et services | ITIL Foundation (ITIL 4 et Version 5, débutant), Scrum PSM I (Guide 2020, débutant) |
| Vie pratique | Premiers secours (PSC1, notes SST) |

- **Trouver un module** : filtres « Tous / Mes modules / À découvrir », par catégorie (avec le nombre de modules) et par niveau,
  et recherche sans accents ni casse sur le titre, le code d'examen et la description.
- **Chapitre par chapitre** : « Programme, chapitres et examen » liste les chapitres ; « + Ajouter » n'ajoute que ce chapitre
  (statut « Ajouté en partie »), « Compléter » ajoute le reste. Les cartes gardent l'ordre du programme.
- **Avancement** : pour chaque module et chaque chapitre ajoutés, une barre « vues / acquises » (acquise = en révision avec un
  intervalle d'au moins 21 jours) et le nombre de cartes à revoir aujourd'hui ; « Étudier » est aussi proposé par chapitre.
- **Retirer** : supprime les notes du module, leurs cartes et les paquets du module devenus vides, après confirmation et une
  sauvegarde automatique. Vos propres cartes rangées dans un paquet du module sont conservées, avec leur paquet.
- **Mise à jour** : réajouter un module (« Mettre à jour » / « Compléter ») ajoute les cartes nouvelles et corrige celles que vous
  n'avez jamais modifiées ; une carte que vous avez modifiée n'est plus touchée, et rien n'est supprimé.
- **Hors ligne** : le contenu des modules est précaché ; un module ajouté se synchronise comme vos autres cartes.
- **Ajouter ou corriger un module** : un fichier par module dans `src/modules/data/`, ses métadonnées dans `src/modules/catalog.ts` ;
  `npm test` vérifie chaque carte et indique les compteurs exacts à reporter dans le catalogue.
- Le contenu est rédigé pour Rappel d'après les programmes publiés : en cas de doute, vérifiez dans un cours officiel.

## Format des imports

**CSV** — séparateur `;`, une carte par ligne, première ligne d'en-tête facultative :

```csv
recto;verso;tags
Quelle commande affiche la table de routage ?;"```
show ip route
```";cisco routage
Le protocole {{c1::OSPF}} utilise le port {{c2::89}};;cours
```

Les champs peuvent être entre guillemets (`"` doublé pour un guillemet, retours à la ligne autorisés). Un recto contenant `{{c1::…}}` devient une carte à trous. Le séparateur `,` ou tabulation est aussi détecté automatiquement.

**Anki (.apkg)** — exportez dans Anki avec *Prise en charge des anciennes versions*. Les cartes, tags et images sont repris ; la planification d'Anki n'est pas convertie (voir `RAPPORT.md`).

## Architecture

```
src/
  db.ts            base Dexie (IndexedDB, schéma v3) : paquets, notes, cartes, révisions, médias, réglages
  types.ts         types du domaine
  lib/             logique pure et testée (Vitest)
    scheduler.ts   enveloppe ts-fsrs (DefaultScheduler, FSRS-6) + intervalles affichés
    queue.ts       file d'étude indexée, limites quotidiennes, notation, annulation
    notes.ts decks.ts cloze.ts render.ts search.ts typed.ts
    csv.ts backup.ts autobackup.ts apkg.ts stats.ts media.ts markdown.ts
    storage.ts errors.ts download.ts theme.ts
  pages/           écrans (Paquets, Modules, Étude, Éditeur, Parcourir, Stats, Réglages)
  modules/         catalogue des modules, contenu (data/, un fichier par module), panneaux SVG (signs.ts)
  components/      Markdown (assaini avec DOMPurify), dialogues accessibles, bandeau de sauvegarde,
                   sécurité des données, écran d'erreur, icônes
e2e/               tests de bout en bout Playwright (desktop, iPhone, Android, GitHub Pages)
scripts/           icônes, lanceur d'outils (casse Windows), build/serveur « GitHub Pages »
.github/workflows/ ci.yml (tests) et deploy.yml (GitHub Pages)
DECISIONS.md       choix de conception pris en autonomie
RAPPORT.md         état d'avancement, bugs connus, prochaines étapes
```

Les décisions de conception sont détaillées dans [DECISIONS.md](DECISIONS.md), l'état du projet dans [RAPPORT.md](RAPPORT.md).
