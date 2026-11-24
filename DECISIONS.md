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
