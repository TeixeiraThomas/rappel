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
