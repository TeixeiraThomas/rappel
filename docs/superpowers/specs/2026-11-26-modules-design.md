# Modules de formation prêts à l'emploi — design

Approuvé le 26 novembre 2026 (« Oui, vas-y »).

## Intention

Permettre à un utilisateur de Rappel de se former sans créer ses cartes : il choisit un module (certification cloud,
code de la route, etc.) dans l'app, l'ajoute en un geste et révise avec FSRS. Les modules doivent couvrir **tout le
programme officiel** de l'examen visé et être adaptés à son format (chapitres = domaines officiels, un chapitre
« L'examen » sur le format, la note et les pièges).

## Objectifs / non-objectifs / anti-objectifs

- Objectifs : catalogue intégré, ajout en un geste, mise à jour sans doublon, hors ligne, synchro comme les autres cartes.
- Non-objectifs : examens blancs chronométrés, QCM à choix multiples (l'app reste un outil de cartes mémoire).
- Anti-objectifs : alourdir le démarrage de l'app ; reproduire une banque de questions protégée (code de la route :
  les questions officielles et leurs photos appartiennent aux éditeurs) ; écraser les cartes modifiées par l'utilisateur.

## Approches envisagées

1. **Catalogue intégré « Modules » (retenue)** : un écran liste les modules, « Ajouter » crée l'arbre de paquets et les
   cartes. Découvrable, un geste, mise à jour possible.
2. Fichiers CSV à télécharger (comme le zip CCNA) : aucun code, mais import manuel fichier par fichier, peu découvrable,
   pas de mise à jour.
3. Modules hébergés à distance (JSON téléchargé) : contenu modifiable sans redéployer, mais dépend du réseau et d'un
   hébergement — inutile tant que l'app est redéployée à chaque changement.

## Conception

- **Catalogue** (`src/modules/catalog.ts`, chargé avec l'écran) : métadonnées seulement (titre, catégorie, description,
  format de l'examen, version visée, nombre de cartes) + `load()` qui importe dynamiquement le contenu
  (`src/modules/data/<id>.ts`, un fichier JS séparé par module, précaché par le service worker).
- **Contenu** : chapitres → cartes au format compact `[recto, verso]` ou `[texte à trous, extra?]`. Conventions des cartes
  CCNA : réponse courte d'abord, explication entre parenthèses (compatible « taper la réponse »).
- **Ajout** (`src/lib/library.ts`) : paquet racine = nom du module, un sous-paquet par chapitre (« 1. … » pour garder
  l'ordre), tags = identifiant du module + chapitre. Les cartes sont créées dans l'ordre du programme (les nouvelles
  cartes sortent par ordre de création → progression du cours, au rythme de la limite quotidienne).
- **Mise à jour** : reconnaît les cartes déjà ajoutées par le tag du module et le recto ; ajoute les manquantes et
  corrige le verso des cartes jamais modifiées par l'utilisateur (`updated === created`) ; ne touche à rien d'autre.
- **Écran « Modules »** (`#/library`, entrée dans la navigation, lien depuis l'accueil vide) : modules groupés par
  catégorie, nombre de cartes, durée estimée au rythme des nouvelles cartes par jour, chapitres, format de l'examen,
  état (ajouté / mise à jour disponible), bouton « Étudier » après ajout.
- **Panneaux routiers** : dessinés en SVG (fonctions dans `src/modules/signs.ts`), insérés dans le recto Markdown
  (DOMPurify conserve le SVG). Dessins simplifiés, pas de reproduction de photos d'examen.

## Catalogue initial

Cloud : AWS CLF-C02, AWS SAA-C03, Azure AZ-900, Azure AZ-104, Google Cloud Digital Leader (version d'août 2026).
Permis : Code de la route auto (ETG, 10 thèmes officiels + panneaux), Code moto (ETM).
Réseau et systèmes : CCNA (664 cartes existantes du zip), Linux Essentials (010-160).
Sécurité et méthodes : CompTIA Security+ (SY0-701 / SY0-801), ITIL Foundation (ITIL 4 et Version 5), Scrum PSM I.
Vie pratique : Premiers secours (PSC1, notes SST).

## Laissé au constructeur

Ordre exact des chapitres, taille de chaque module (viser la couverture complète des objectifs officiels), choix des
cartes à trous, style visuel de l'écran dans la charte existante.

## Vérification

Tests unitaires : validité de chaque carte de chaque module (comme une note créée à la main), pas de doublon de recto,
SVG bien formés, compteurs du catalogue exacts, ajout / réajout / mise à jour. Test e2e : ajouter un module et réviser.
