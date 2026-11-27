// Format des modules de formation prêts à l'emploi (voir docs/superpowers/specs/2026-11-26-modules-design.md).

/**
 * Une carte, au format compact : [recto, verso].
 * Un recto contenant {{c1::…}} devient une carte à trous ; le second élément est alors l'« extra » (facultatif).
 * Troisième élément facultatif : tags supplémentaires séparés par des espaces (en plus du module et du chapitre).
 * Convention : réponse courte d'abord, explication entre parenthèses (compatible « taper la réponse »).
 */
export type ModuleCard = [front: string, back?: string, tags?: string]

export interface ModuleChapter {
  /** Nom du sous-paquet (sans numéro : il est ajouté pour garder l'ordre du programme). */
  title: string
  /** Tag du chapitre (minuscules, sans espaces). */
  tag: string
  cards: ModuleCard[]
}

export interface ModuleContent {
  chapters: ModuleChapter[]
}

export type ModuleCategory = 'cloud' | 'reseau' | 'systemes' | 'securite' | 'gestion' | 'permis' | 'vie'

/** Niveau visé : aide à choisir par où commencer. */
export type ModuleLevel = 'debutant' | 'intermediaire' | 'avance'

export interface ModuleMeta {
  /** Identifiant stable (sert aussi de tag à toutes les cartes du module). */
  id: string
  /** Titre affiché dans la bibliothèque. */
  title: string
  /** Nom du paquet racine créé à l'ajout. */
  deckName: string
  category: ModuleCategory
  level: ModuleLevel
  /** Une ou deux phrases : pour qui, quoi. */
  description: string
  /** Version du programme visée (ex. « CLF-C02 »). */
  version: string
  /** Format de l'examen : lignes « libellé : valeur ». */
  exam: { label: string; value: string }[]
  /** Nombre de notes du module (vérifié par les tests). */
  notes: number
  /** Nombre de cartes générées (une note à trous peut en donner plusieurs ; vérifié par les tests). */
  cards: number
  /** Charge le contenu (fichier séparé, téléchargé à la demande). */
  load: () => Promise<ModuleContent>
}
