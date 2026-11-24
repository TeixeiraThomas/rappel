# Décisions de conception

Décisions prises en autonomie pendant la session (aucune question posée, comme demandé).

## Produit

1. **Nom** : « Rappel », avec une icône originale (deux cartes empilées + points d'intervalle croissant). Aucun nom, logo ni visuel d'Anki.
2. **Pas de paquet par défaut** : l'écran d'accueil propose de créer le premier paquet. Évite un paquet « Défaut » parasite.
3. **Modèle note → cartes** (comme Anki) : une *note* (recto/verso/tags) génère 1 carte (recto/verso), 2 cartes (+ inverse) ou N cartes (une par numéro de trou `cN`). Modifier une note resynchronise ses cartes (ajout/suppression) sans toucher à celles qui existent.
4. **Pas de types de notes personnalisés / modèles HTML** : trois types suffisent pour l'usage visé et gardent l'app simple.
5. **Tags** : normalisés en minuscules, sans espaces (`#Réseau CCNA` → `réseau`, `ccna`).
6. **Recherche** : en mémoire sur les notes (sans accents, sans casse) avec `tag:`, `deck:` (sous-chaîne du chemin complet, donc inclut les sous-paquets) et `type:`. Largement suffisant pour des milliers de notes.
7. **Cartes suspendues** : possibles depuis « Parcourir » (utile pour mettre une carte de côté).

## Planification

8. **FSRS via `ts-fsrs`** (paramètres par défaut, fuzz activé, rétention visée 90 % réglable). L'API « classique » `fsrs().repeat()` est utilisée : encore exposée par la v6 même si marquée dépréciée au profit des nouveaux schedulers. Tout est isolé dans `lib/scheduler.ts` pour faciliter une migration.
9. **Aperçu = résultat** : les 4 résultats possibles sont calculés une seule fois à l'affichage de la carte ; l'intervalle montré sur un bouton est exactement celui appliqué (important avec le fuzz).
10. **Étapes d'apprentissage** : celles de ts-fsrs par défaut (1 min, 10 min ; réapprentissage 10 min). Une carte en (ré)apprentissage due dans les 20 minutes est réinsérée plus loin dans la séance.
11. **Journée d'étude** : change à **4 h du matin** (comme Anki), pour qu'une séance tardive compte pour la veille. Les révisions « dues aujourd'hui » se jugent au jour, pas à l'heure : toute carte de révision due avant la fin de la journée d'étude est proposée.
12. **Limites quotidiennes globales** (toute la collection), pas par paquet : 20 nouvelles / 200 révisions par défaut. Le décompte se fait sur l'historique du jour, donc il survit à un rechargement. Les cartes en apprentissage ne comptent pas dans les limites.
13. **Ordre de la file** : apprentissage, puis révisions (les plus en retard d'abord), puis nouvelles cartes (par ordre de création).
14. **Annulation** : restaure la carte telle qu'avant et supprime l'entrée d'historique (statistiques cohérentes).

## Révision

15. **Mode « taper la réponse »** : interrupteur dans l'écran d'étude (mémorisé). Verdicts `exact`, `correct` (casse/accents/ponctuation finale près), `presque` (similarité ≥ 80 % sur une réponse d'au moins 5 caractères), `incorrect`. La note est **suggérée** (mise en évidence) mais jamais appliquée automatiquement : l'utilisateur décide. Pour un texte à trous, on compare au(x) mot(s) du trou actif ; pour un bloc de code, au contenu du code sans les ```.
16. **Balayage** : horizontal uniquement (gauche = À revoir, droite = Bien), seulement après révélation, pour ne pas gêner le défilement vertical des cartes longues. Seuil de 100 px. La souris n'initie pas de balayage (on garde la sélection de texte).
17. **Raccourcis clavier** : `Espace/Entrée`, `1-4`, `Z/U/Retour arrière` (annuler), `Échap`.

## Technique

18. **Stockage** : Dexie/IndexedDB. Dates en millisecondes (epoch) pour l'indexation et le JSON. Identifiants UUID (fusion de sauvegardes sans collision).
19. **Images** : redimensionnées (≤ 1280 px) et recompressées (WebP si possible) à l'ajout, stockées en data URL dans une table `media`, référencées par `![](media:ID)`. Simple à sauvegarder dans le JSON, au prix d'une sauvegarde plus lourde.
20. **Markdown** : `marked` + **DOMPurify** (le contenu importé — CSV, Anki — n'est pas de confiance). Pas de coloration syntaxique (poids et complexité) ; blocs de code en monospace avec bouton « Copier ». Le bouton est injecté comme nœud DOM pendant l'assainissement (pas de retouche de chaîne HTML après coup).
21. **Routage par hash** (`#/…`) : fonctionne sur tout hébergement statique, y compris GitHub Pages sous un sous-dossier, sans règle de redirection.
22. **PWA** : `vite-plugin-pwa` (Workbox `generateSW`), mise à jour automatique, tout précaché (JS, CSS, icônes, WASM) → démarrage 100 % hors ligne. Demande `navigator.storage.persist()` pour limiter l'éviction des données.
23. **Import CSV** : séparateur `;` par défaut, détection auto de `,`/tabulation, en-tête facultatif, doublons ignorés (même recto+verso dans le paquet cible), aperçu avant import, lignes invalides signalées.
24. **Sauvegarde JSON** : contient tout (dont l'historique, les images et les réglages), versionnée (`version: 1`) et validée à l'import ; deux modes : *fusionner* (par identifiant) ou *tout remplacer* (avec confirmation).
25. **Import .apkg** : lecture de `collection.anki21` / `collection.anki2` via `sql.js` (WASM chargé à la demande) et `jszip`. Reprend contenu, tags, paquets hiérarchiques (`A::B`), images ; types de notes déduits (standard, « et inversé » si 2 modèles de carte présents, texte à trous). **Planification non convertie** : les cartes arrivent comme nouvelles. Le format compressé récent (`.anki21b`, zstd + protobuf) n'est pas lu : message demandant de ré-exporter en mode compatibilité.
26. **Tests** : Vitest en environnement Node avec `fake-indexeddb`, config séparée (`vitest.config.ts`) sans plugins Vite PWA/React. La logique est dans `src/lib` pour être testable sans navigateur ; l'UI a été vérifiée manuellement dans un navigateur (voir RAPPORT.md).
27. **Thème** : sombre par défaut ; clair et « système » disponibles dans les Réglages.

---

# Session 2 — fiabilisation

## Bugs connus (RAPPORT session 1)

28. **Dernière carte en apprentissage** : quand il ne reste que des cartes en (ré)apprentissage pas encore dues, la séance affiche un écran « Prochaine carte dans mm:ss » (compte à rebours) avec « Continuer maintenant » et « Terminer ». Si d'autres cartes sont encore à faire, les cartes en apprentissage proches (≤ 20 min) restent réinsérées dans la séance comme avant.
29. **Taille du bundle** : écrans secondaires (Parcourir, Éditeur, Stats, Réglages) chargés à la demande ; JSZip et sql.js (WASM) chargés uniquement à l'import `.apkg`. Le bundle principal passe de ≈ 590 ko à ≈ 354 ko (≈ 114 ko gzip). Tout reste précaché par le service worker : aucun impact hors ligne.
30. **Casse du chemin sous Windows** : `npm test` passe par `scripts/run-tool.mjs`, qui se replace dans le chemin réel (`C:\…`) avant de lancer Vitest/Playwright. Plus d'échec selon la casse du terminal.
31. **Journaux de révision orphelins** après suppression d'une carte : **comportement voulu**, pas un bug. L'historique sert aux statistiques (série, réussite, calendrier) ; supprimer une carte ne doit pas effacer le passé de l'utilisateur.
32. **Limites quotidiennes globales** : conservées (choix de produit, pas un bug). **`::` dans une réponse à trous** : comportement identique à Anki, conservé pour la compatibilité des imports. **`.anki21b`** : toujours non supporté (nécessiterait zstd + protobuf) ; message d'erreur explicite.

## Migration de ts-fsrs

33. `fsrs().repeat()` (dépréciée) remplacée par `DefaultScheduler({ version: 'FSRS-6', … }).preview()`. **Version FSRS-6 imposée** : le défaut de la nouvelle API est FSRS-7, ce qui aurait changé tous les intervalles.
34. **Méthode** : tests de non-régression écrits AVANT la migration (`scheduler.regression.test.ts`, instantanés de 5 parcours de révision complets, 4 boutons à chaque étape, fuzz désactivé car aléatoire). Résultat de la migration : **tout est identique à l'ancienne API, sauf un cas extrême** — carte très difficile en réapprentissage (stabilité < 1 jour) : « Facile » donne 2 j au lieu de 1 j, alors que « Bien » donne déjà 1 j. L'ancienne API produisait un « Facile » égal à « Bien » ; la nouvelle impose Facile > Bien. Écart accepté (plus cohérent), instantané mis à jour.
35. **Fuzz** : avec la nouvelle API il dépend de l'identifiant de carte ; on passe l'identifiant stable de notre carte pour qu'il soit reproductible par carte. Test de bornes (±15 % ou ±2 j) pour le fuzz.
36. L'API est asynchrone (`prepareScheduler`) : le planificateur est créé une fois au chargement de la séance ; `previewAll(card, now, scheduler)` reste synchrone.

## Sécurité des données

37. **Stockage persistant** : `navigator.storage.persist()` demandé au lancement et à nouveau au premier geste (certains navigateurs l'exigent). Les Réglages affichent l'état (protégé oui/non), l'espace utilisé et un bouton « Protéger le stockage » si non accordé.
38. **Rappel de sauvegarde** : bandeau sur l'écran des paquets si la dernière sauvegarde exportée (ou, à défaut, la plus ancienne carte) date de plus de N jours — 7 par défaut, réglable (3/7/14/30 jours ou désactivé). « Plus tard » repousse de 3 jours. La date de dernière sauvegarde est mémorisée à chaque export JSON.
39. **Confirmations de suppression** : déjà présentes pour paquet, carte, « tout effacer » et « tout remplacer » ; ajoutées pour la suppression d'une sauvegarde automatique. Aucune suppression sans dialogue de confirmation.
40. **Sauvegarde automatique avant opération risquée** : import CSV, import `.apkg`, restauration JSON (fusion ou remplacement), restauration d'une sauvegarde automatique, et effacement total. Stockée dans une base IndexedDB **séparée** (`rappel-autobackups`) pour survivre à un effacement ou à une restauration ratée de la base principale ; 5 instantanés conservés ; restaurables ou téléchargeables depuis les Réglages. Si l'instantané est impossible (quota), l'opération continue mais l'utilisateur est averti.
41. Base principale passée en version 2 (index `created` sur les notes) : migration automatique, sans perte.

## Tests de bout en bout (Playwright)

42. **Cible** : le **build de production** servi par `vite preview` (le service worker et le hors ligne n'existent pas en mode développement). `npm run test:e2e` construit puis teste ; un second serveur sert un build « GitHub Pages » (base `/rappel/`, dossier `dist-gh/`) pour la vérification des chemins.
43. **Profils** : Chromium desktop, plus l'**émulation** iPhone 13 et Pixel 7 (taille d'écran, tactile, user-agent) **sur Chromium** : WebKit/Safari réel n'est pas disponible ici. Ce qui reste à valider sur de vrais téléphones est listé dans RAPPORT.md.
44. **Balayage** : simulé avec de vrais événements tactiles (`Input.dispatchTouchEvent` via le protocole DevTools), avec des mouvements espacés de 16 ms et une pause avant de lever le doigt, pour éviter l'inertie (fling) de Chrome qui avale le « tap » suivant — artefact de simulation, pas un défaut de l'app.
45. **Données de test** : insérées directement dans IndexedDB (`seed()`), ce qui permet 10 000 cartes en ~3 s ; l'état réel est relu de la même façon (`readTable()`), pour vérifier ce qui est vraiment enregistré et pas seulement ce qui est affiché.
46. **Hors ligne** : vraie coupure réseau (`context.setOffline(true)`, vérifiée par l'échec d'un `fetch`), rechargements complets, écrans chargés à la demande, création/révision de cartes, import `.apkg` (WASM), puis retour du réseau.
47. **Bug trouvé par ces tests et corrigé** : le conteneur défilant (la carte) annulait les gestes horizontaux (`pointercancel`) malgré `touch-action: pan-y` posé sur son parent → le balayage ne fonctionnait pas du tout au doigt. `touch-action` est désormais posé sur la carte elle-même.
48. **Autre défaut trouvé et corrigé** : en enchaînant très vite les touches (Espace, 4, Espace…), la touche suivant une réponse pouvait être perdue pendant l'écriture en base. La notation est désormais **optimiste** : l'interface passe tout de suite à la carte suivante, l'écriture se fait en arrière-plan dans une file ordonnée ; l'annulation attend la fin des écritures en cours.

## Accessibilité

49. **Contrôle automatique** : axe-core (WCAG 2.0/2.1 A et AA, contrastes inclus) sur tous les écrans, dans les deux thèmes, y compris révision (recto, verso, mode saisie) et dialogues. Seuil : zéro violation.
50. **Contrastes** : deux jetons d'accent — `--accent` (texte, icônes ; clair en thème sombre) et `--accent-bg` (fonds portant du texte blanc, ≥ 4,5:1) ; couleurs d'état (À revoir/Difficile/Bien/Facile) assombries en thème clair ; plus aucune opacité réduite sur du texte.
51. **Clavier** : lien d'évitement « Aller au contenu », contour de focus visible partout (3 px), dialogues avec focus initial, piège à focus (Tab/Maj+Tab), Échap pour fermer et restitution du focus au bouton d'origine.
52. **Lecteurs d'écran** : la ligne de paquet est un seul bouton nommé « Étudier <paquet> » (zone cliquable étendue à toute la ligne, compteurs lus séparément comme groupe), plus de contrôles imbriqués dans « Parcourir » (le bouton Suspendre est un frère du bouton d'édition), barre de progression nommée, champs de fichier étiquetés, notifications dans une zone `role="status"` toujours présente, `aria-current` dans la navigation, titre de page mis à jour à chaque écran.
53. **Mouvement** : animations discrètes (apparition 0,12–0,2 s) désactivées par `prefers-reduced-motion`.

## Performances

54. **10 000 cartes** (10 paquets × 1 000) : accueil, parcourir (paginé par 100 : jamais 10 000 nœuds DOM), recherche, statistiques, démarrage de séance et enchaînement des réponses sont tous < 1 s en mesure isolée (détail dans RAPPORT.md).
55. **File d'étude indexée** : base en version 3 avec index composé `[état+échéance]` ; la file lit uniquement les cartes à étudier (nouvelles lues dans l'ordre jusqu'au plafond du jour) au lieu de charger toute la collection. Les **compteurs de l'accueil** parcourent encore toutes les cartes en mémoire : suffisant à 10 000 cartes, à indexer si la collection dépasse ~50 000.

## Finitions

56. **Erreurs** : messages en français via `friendlyError()` (stockage plein, base inaccessible, version trop récente…) ; écran d'erreur dédié si IndexedDB est bloqué (navigation privée) ; `ErrorBoundary` par écran contre la page blanche ; filet `unhandledrejection` → notification lisible.
57. **Écrans vides** : accueil (bienvenue), parcourir (aucune carte / aucun résultat), statistiques (pas encore de données), accueil quand tout est révisé (« Rien à étudier pour le moment »), adresse inconnue (« Page introuvable »).
58. **Éditeur** : confirmation avant de quitter avec du texte non enregistré (pas de confirmation si rien n'a été saisi).

## GitHub Pages

59. `node scripts/serve-gh.mjs` construit avec `BASE_PATH=/rappel/` dans `dist-gh/` et le sert ; les tests vérifient : aucune ressource en 404 ni hors de `/rappel/`, manifeste (`start_url`, `scope`, icônes), service worker de portée `/rappel/`, fonctionnement hors ligne et WASM de l'import `.apkg` sous le sous-dossier.
