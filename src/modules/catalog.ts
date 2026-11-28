import type { ModuleCategory, ModuleDomain, ModuleLevel, ModuleMeta } from './types'

// Catalogue des modules prêts à l'emploi. Seules ces métadonnées sont chargées avec l'écran « Modules » :
// le contenu de chaque module est un fichier séparé, téléchargé (et précaché hors ligne) à la demande.
// Les compteurs `notes` / `cards` sont vérifiés par src/modules/modules.test.ts.

// Deux niveaux : domaines puis sous-catégories. Ordre d'affichage : du plus demandé au moins demandé
// (permis puis langues : premières formations financées par le CPF en 2025, voir DECISIONS.md).
export const DOMAINS: { id: ModuleDomain; label: string }[] = [
  { id: 'permis', label: 'Permis de conduire' },
  { id: 'langues', label: 'Langues' },
  { id: 'informatique', label: 'Informatique' },
  { id: 'gestion', label: 'Gestion et méthodes' },
  { id: 'vie', label: 'Vie pratique' },
]

export const CATEGORIES: { id: ModuleCategory; domain: ModuleDomain; label: string }[] = [
  { id: 'auto', domain: 'permis', label: 'Voiture (permis B)' },
  { id: 'moto', domain: 'permis', label: 'Moto (permis A)' },
  { id: 'bateau', domain: 'permis', label: 'Bateau (permis plaisance)' },
  { id: 'anglais', domain: 'langues', label: 'Anglais' },
  { id: 'bureautique', domain: 'informatique', label: 'Bureautique et numérique' },
  { id: 'cloud', domain: 'informatique', label: 'Cloud' },
  { id: 'reseau', domain: 'informatique', label: 'Réseau' },
  { id: 'systemes', domain: 'informatique', label: 'Systèmes' },
  { id: 'securite', domain: 'informatique', label: 'Cybersécurité' },
  { id: 'projet', domain: 'gestion', label: 'Gestion de projet (agile)' },
  { id: 'services', domain: 'gestion', label: 'Gestion des services (ITSM)' },
  { id: 'secourisme', domain: 'vie', label: 'Secourisme' },
]

/** Domaine d'un module (via sa sous-catégorie). */
export const domainOf = (m: Pick<ModuleMeta, 'category'>): ModuleDomain => CATEGORIES.find((c) => c.id === m.category)!.domain

export const LEVELS: { id: ModuleLevel; label: string }[] = [
  { id: 'debutant', label: 'Débutant' },
  { id: 'intermediaire', label: 'Intermédiaire' },
  { id: 'avance', label: 'Avancé' },
]

export const MODULES: ModuleMeta[] = [
  {
    id: 'aws-clf-c02',
    title: 'AWS Certified Cloud Practitioner',
    deckName: 'AWS Cloud Practitioner (CLF-C02)',
    category: 'cloud',
    level: 'debutant',
    description:
      "La certification d'entrée AWS : concepts du cloud, sécurité, services principaux, facturation et support. Idéale pour débuter, technique ou non.",
    version: 'CLF-C02',
    exam: [
      { label: 'Questions', value: '65 (50 notées + 15 non notées), choix unique ou multiple' },
      { label: 'Durée', value: '90 min' },
      { label: 'Réussite', value: '700 / 1000' },
      { label: 'Domaines', value: 'Concepts du cloud 24 % · Sécurité et conformité 30 % · Technologies et services 34 % · Facturation, tarifs et support 12 %' },
    ],
    notes: 253,
    cards: 253,
    load: () => import('./data/aws-clf-c02').then((m) => m.default),
  },
  {
    id: 'aws-saa-c03',
    title: 'AWS Certified Solutions Architect – Associate',
    deckName: 'AWS Solutions Architect Associate (SAA-C03)',
    category: 'cloud',
    level: 'intermediaire',
    description:
      'Concevoir des architectures AWS sécurisées, résilientes, performantes et économiques : VPC, EC2, stockage, bases de données, découplage, haute disponibilité.',
    version: 'SAA-C03',
    exam: [
      { label: 'Questions', value: '65 (50 notées + 15 non notées), mises en situation' },
      { label: 'Durée', value: '130 min' },
      { label: 'Réussite', value: '720 / 1000' },
      { label: 'Domaines', value: 'Architectures sécurisées 30 % · résilientes 26 % · performantes 24 % · optimisées en coûts 20 %' },
    ],
    notes: 220,
    cards: 220,
    load: () => import('./data/aws-saa-c03').then((m) => m.default),
  },
  {
    id: 'az-900',
    title: 'Microsoft Azure Fundamentals',
    deckName: 'Azure Fundamentals (AZ-900)',
    category: 'cloud',
    level: 'debutant',
    description:
      "Les bases d'Azure : modèles de cloud, régions et zones, calcul, réseau, stockage, identité (Entra ID), gouvernance et coûts.",
    version: 'AZ-900',
    exam: [
      { label: 'Questions', value: 'environ 40 à 60' },
      { label: 'Durée', value: '45 min' },
      { label: 'Réussite', value: '700 / 1000' },
      { label: 'Domaines', value: 'Concepts du cloud 25–30 % · Architecture et services 35–40 % · Gestion et gouvernance 30–35 %' },
    ],
    notes: 136,
    cards: 136,
    load: () => import('./data/az-900').then((m) => m.default),
  },
  {
    id: 'az-104',
    title: 'Microsoft Azure Administrator',
    deckName: 'Azure Administrator (AZ-104)',
    category: 'cloud',
    level: 'intermediaire',
    description:
      'Administrer Azure au quotidien : identités et RBAC, Azure Policy, stockage, machines virtuelles, conteneurs, réseaux virtuels, supervision et sauvegarde.',
    version: 'AZ-104',
    exam: [
      { label: 'Questions', value: 'environ 40 à 60, dont études de cas' },
      { label: 'Durée', value: '100 min' },
      { label: 'Réussite', value: '700 / 1000' },
      { label: 'Domaines', value: 'Identités et gouvernance 20–25 % · Stockage 15–20 % · Calcul 20–25 % · Réseau 15–20 % · Supervision et maintenance 10–15 %' },
    ],
    notes: 150,
    cards: 150,
    load: () => import('./data/az-104').then((m) => m.default),
  },
  {
    id: 'gcp-cdl',
    title: 'Google Cloud Digital Leader',
    deckName: 'Google Cloud Digital Leader',
    category: 'cloud',
    level: 'debutant',
    description:
      'La certification fondamentale de Google Cloud : transformation numérique, données, IA, modernisation des applications, sécurité et opérations.',
    version: "Programme d'août 2026",
    exam: [
      { label: 'Questions', value: '50 à 60, choix unique ou multiple' },
      { label: 'Durée', value: '90 min' },
      { label: 'Sections', value: '6 sections de 16 à 17 % chacune' },
    ],
    notes: 120,
    cards: 120,
    load: () => import('./data/gcp-cdl').then((m) => m.default),
  },
  {
    id: 'code-auto',
    title: 'Code de la route — voiture',
    deckName: 'Code de la route (auto)',
    category: 'auto',
    level: 'debutant',
    highlight: 'Le plus demandé',
    description:
      "L'examen théorique général (ETG) du permis B : les 10 thèmes officiels, les panneaux, les vitesses, les distances, l'alcool, les premiers secours.",
    version: 'ETG',
    exam: [
      { label: 'Questions', value: '40, une ou plusieurs bonnes réponses (le nombre est indiqué)' },
      { label: 'Durée', value: 'environ 30 min' },
      { label: 'Réussite', value: '35 bonnes réponses sur 40' },
      { label: 'Validité', value: "5 ans, dans la limite de 5 présentations à l'examen pratique" },
    ],
    notes: 287,
    cards: 287,
    load: () => import('./data/code-auto').then((m) => m.default),
  },
  {
    id: 'code-moto',
    title: 'Code de la route — moto',
    deckName: 'Code de la route (moto)',
    category: 'moto',
    level: 'debutant',
    description:
      "L'épreuve théorique moto (ETM) des permis A1, A2 et A : équipement, trajectoires, freinage, visibilité, inter-files, passager. À compléter avec le module voiture pour les règles communes.",
    version: 'ETM',
    exam: [
      { label: 'Questions', value: '40, dont des séquences vidéo' },
      { label: 'Réussite', value: '35 bonnes réponses sur 40' },
      { label: 'Qui', value: 'tous les candidats A1 / A2, même titulaires du permis B' },
    ],
    notes: 113,
    cards: 113,
    load: () => import('./data/code-moto').then((m) => m.default),
  },
  {
    id: 'ccna',
    title: 'Cisco CCNA',
    deckName: 'CCNA 200-301',
    category: 'reseau',
    level: 'intermediaire',
    description:
      'Le programme CCNA en 18 semaines : modèle OSI, IPv4/IPv6 et sous-réseaux, VLAN, STP, OSPF, ACL, NAT, sécurité, Wi-Fi, automatisation.',
    version: '200-301',
    exam: [
      { label: 'Durée', value: '120 min' },
      { label: 'Format', value: 'QCM, glisser-déposer, simulations' },
      { label: 'Domaines', value: 'Fondamentaux · Accès réseau · Connectivité IP · Services IP · Sécurité · Automatisation' },
    ],
    notes: 664,
    cards: 665,
    load: () => import('./data/ccna').then((m) => m.default),
  },
  {
    id: 'linux-essentials',
    title: 'Linux Essentials (LPI)',
    deckName: 'Linux Essentials (010-160)',
    category: 'systemes',
    level: 'debutant',
    description:
      'Bien démarrer sous Linux : distributions et licences libres, ligne de commande, fichiers, scripts, processus, utilisateurs et permissions.',
    version: '010-160 v1.6',
    exam: [
      { label: 'Questions', value: '40' },
      { label: 'Durée', value: '60 min' },
      { label: 'Réussite', value: '500 / 800' },
    ],
    notes: 171,
    cards: 171,
    load: () => import('./data/linux-essentials').then((m) => m.default),
  },
  {
    id: 'security-plus',
    title: 'CompTIA Security+',
    deckName: 'CompTIA Security+',
    category: 'securite',
    level: 'intermediaire',
    description:
      'La référence de la cybersécurité de base : menaces et attaques, cryptographie, architecture, opérations de sécurité, gestion des risques et conformité.',
    version: 'SY0-701 / SY0-801',
    exam: [
      { label: 'Version', value: 'SY0-801 depuis le 17 novembre 2026 ; SY0-701 jusqu’au 11 juin 2027' },
      { label: 'Questions', value: '90 au maximum (QCM et questions pratiques)' },
      { label: 'Durée', value: '90 min' },
      { label: 'Réussite', value: '750 / 900' },
    ],
    notes: 218,
    cards: 218,
    load: () => import('./data/security-plus').then((m) => m.default),
  },
  {
    id: 'itil',
    title: 'ITIL Foundation',
    deckName: 'ITIL Foundation',
    category: 'services',
    level: 'debutant',
    description:
      'La gestion des services numériques : valeur et co-création, 4 dimensions, principes directeurs, système de valeur, cycle de vie, pratiques clés. Couvre ITIL 4 et ITIL (Version 5).',
    version: 'ITIL 4 / Version 5',
    exam: [
      { label: 'Questions', value: '40, QCM, livre fermé' },
      { label: 'Durée', value: '60 min' },
      { label: 'Réussite', value: '65 % (26 / 40)' },
    ],
    notes: 100,
    cards: 100,
    load: () => import('./data/itil').then((m) => m.default),
  },
  {
    id: 'scrum-psm1',
    title: 'Scrum — Professional Scrum Master I',
    deckName: 'Scrum (PSM I)',
    category: 'projet',
    level: 'debutant',
    description:
      'Le Guide Scrum 2020 en détail : piliers, valeurs, responsabilités, événements, artefacts et engagements, plus les pièges classiques de l’examen.',
    version: 'Guide Scrum 2020',
    exam: [
      { label: 'Questions', value: '80, en anglais' },
      { label: 'Durée', value: '60 min' },
      { label: 'Réussite', value: '85 %' },
    ],
    notes: 91,
    cards: 91,
    load: () => import('./data/scrum-psm1').then((m) => m.default),
  },
  {
    id: 'premiers-secours',
    title: 'Premiers secours',
    deckName: 'Premiers secours (PSC1)',
    category: 'secourisme',
    level: 'debutant',
    description:
      'Les gestes qui sauvent : protéger, alerter, étouffement, hémorragie, perte de connaissance, arrêt cardiaque et défibrillateur, malaises et traumatismes.',
    version: 'PSC1 / SST',
    exam: [
      { label: 'Formation', value: 'PSC1 : environ 7 h, sans examen écrit (gestes évalués en continu)' },
      { label: 'Au travail', value: 'SST : 14 h, maintien des compétences tous les 24 mois' },
    ],
    notes: 81,
    cards: 81,
    load: () => import('./data/premiers-secours').then((m) => m.default),
  },
  {
    id: 'toeic',
    title: 'TOEIC — anglais professionnel',
    deckName: 'TOEIC',
    category: 'anglais',
    level: 'intermediaire',
    description:
      "Le vocabulaire de l'anglais professionnel par thème (bureau, RH, finance, voyages, commerce), les faux amis, la grammaire de la partie 5 et les verbes à particule, plus le format de l'examen.",
    version: 'L&R · 4 compétences',
    exam: [
      { label: 'Questions', value: '200 (Listening and Reading), questionnaire à choix multiples' },
      { label: 'Durée', value: '2 h (45 min d’écoute, 75 min de lecture)' },
      { label: 'Score', value: '10 à 990 ; environ 785 pour B2' },
      { label: 'CPF', value: 'Version 4 compétences (avec expression orale et écrite)' },
    ],
    notes: 229,
    cards: 231,
    load: () => import('./data/toeic').then((m) => m.default),
  },
  {
    id: 'permis-cotier',
    title: 'Permis bateau — option côtière',
    deckName: 'Permis bateau côtier',
    category: 'bateau',
    level: 'debutant',
    description:
      'Le permis plaisance en mer : balisage, règles de barre, feux des navires, signaux et VHF, sécurité, réglementation, météo et marées.',
    version: 'Option côtière',
    exam: [
      { label: 'Questions', value: '30 (QCM), 5 fautes au maximum' },
      { label: 'Formation', value: 'Au moins 5 h de théorie et 3 h 30 de pratique' },
      { label: 'Zone', value: 'Jusqu’à 6 milles d’un abri ; obligatoire au-delà de 6 CV' },
    ],
    notes: 104,
    cards: 104,
    load: () => import('./data/permis-cotier').then((m) => m.default),
  },
  {
    id: 'pix',
    title: 'Pix — compétences numériques',
    deckName: 'Pix',
    category: 'bureautique',
    level: 'debutant',
    description:
      'Les 5 domaines et 16 compétences du référentiel Pix : recherche d’information, communication, création de contenus, sécurité et vie privée, environnement numérique.',
    version: 'Référentiel Pix',
    exam: [
      { label: 'Format', value: 'Questions adaptatives en ligne ; certification surveillée en centre agréé' },
      { label: 'Score', value: 'En pix, par compétence et au total' },
    ],
    notes: 64,
    cards: 64,
    load: () => import('./data/pix').then((m) => m.default),
  },
  {
    id: 'tosa-excel',
    title: 'TOSA Excel',
    deckName: 'TOSA Excel',
    category: 'bureautique',
    level: 'intermediaire',
    description:
      'Excel pour la certification TOSA : navigation et raccourcis, mise en forme, formules et références, fonctions (SI, RECHERCHEV, SOMME.SI.ENS…), tris, filtres, tableaux croisés dynamiques et graphiques.',
    version: 'TOSA',
    exam: [
      { label: 'Questions', value: '35, QCM et exercices pratiques, test adaptatif' },
      { label: 'Durée', value: '60 min' },
      { label: 'Score', value: '1 à 1 000 ; opérationnel de 551 à 725' },
    ],
    notes: 71,
    cards: 71,
    load: () => import('./data/tosa-excel').then((m) => m.default),
  },
]

export const moduleById = (id: string) => MODULES.find((m) => m.id === id)
