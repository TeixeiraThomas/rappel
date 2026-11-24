# Rappel — cartes mémoire à répétition espacée

Application web progressive (PWA) de cartes mémoire, inspirée d'Anki mais plus simple et plus moderne.
Interface en français, mode sombre, pensée pour le mobile d'abord. Fonctionne **hors ligne** et s'installe
sur iPhone, Android et PC. Toutes les données restent sur l'appareil (IndexedDB) ; aucun compte, aucun serveur.

## Fonctionnalités

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
npm test           # tests unitaires (Vitest, ~70 tests)
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
  db.ts            base Dexie (IndexedDB) : paquets, notes, cartes, révisions, médias, réglages
  types.ts         types du domaine
  lib/             logique pure et testée
    scheduler.ts   enveloppe ts-fsrs (FSRS) + intervalles affichés
    queue.ts       file d'étude, limites quotidiennes, annulation
    notes.ts decks.ts cloze.ts render.ts search.ts typed.ts
    csv.ts backup.ts apkg.ts stats.ts media.ts markdown.ts
  pages/           écrans (Paquets, Étude, Éditeur, Parcourir, Stats, Réglages)
  components/      Markdown (assaini avec DOMPurify), dialogues, icônes
DECISIONS.md       choix de conception pris en autonomie
RAPPORT.md         état d'avancement, bugs connus, prochaines étapes
```

Les décisions de conception sont détaillées dans [DECISIONS.md](DECISIONS.md), l'état du projet dans [RAPPORT.md](RAPPORT.md).
