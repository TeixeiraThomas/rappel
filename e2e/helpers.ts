import { expect, type Page } from '@playwright/test'
import JSZip from 'jszip'
import initSqlJs from 'sql.js'

/** Ouvre l'application ; sur l'accueil, attend l'écran des paquets, sinon la navigation principale. */
export async function openApp(page: Page, path = '/') {
  await page.goto(path)
  if (path === '/') await expect(page.getByRole('heading', { name: 'Paquets', level: 1 })).toBeVisible()
  else await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
}

export interface SeedCard {
  front: string
  back: string
  tags?: string[]
}

/**
 * Insère directement des paquets/notes/cartes dans IndexedDB (rapide, même pour 10 000 cartes),
 * puis recharge la page. L'application doit avoir été ouverte une fois (création de la base).
 */
export async function seed(page: Page, decks: { name: string; cards: SeedCard[] }[]) {
  await page.evaluate(async (decks) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('rappel')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = db.transaction(['decks', 'notes', 'cards'], 'readwrite')
    const now = Date.now()
    let n = 0
    for (const d of decks) {
      const deckId = crypto.randomUUID()
      tx.objectStore('decks').put({ id: deckId, name: d.name, parentId: null, created: now })
      for (const c of d.cards) {
        const noteId = crypto.randomUUID()
        tx.objectStore('notes').put({ id: noteId, deckId, type: 'basic', front: c.front, back: c.back, tags: c.tags ?? [], created: now + n, updated: now + n })
        tx.objectStore('cards').put({
          id: crypto.randomUUID(), noteId, deckId, ord: 0, due: now + n, stability: 0, difficulty: 0, scheduledDays: 0,
          learningSteps: 0, reps: 0, lapses: 0, state: 0, lastReview: null,
        })
        n++
      }
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, decks)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Paquets', level: 1 })).toBeVisible()
}

/** Lit toutes les lignes d'une table IndexedDB (pour vérifier l'état réel après une action). */
export async function readTable<T = Record<string, unknown>>(page: Page, table: string): Promise<T[]> {
  return page.evaluate(async (table) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('rappel')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const rows: unknown[] = await new Promise((res, rej) => {
      const r = db.transaction(table).objectStore(table).getAll()
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    db.close()
    return rows
  }, table) as Promise<T[]>
}

/** Crée un paquet via l'interface. */
export async function createDeckUI(page: Page, name: string) {
  await page.getByRole('button', { name: /Créer un paquet|^Paquet$/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').fill(name)
  await dialog.getByRole('textbox').press('Enter')
  await expect(page.getByRole('button', { name: `Étudier ${name}` })).toBeVisible()
}

/** Fabrique un fichier .apkg minimal (format Anki « legacy ») pour les tests d'import. */
export async function makeApkg(): Promise<Buffer> {
  const SQL = await initSqlJs()
  const d = new SQL.Database()
  d.run('CREATE TABLE col (models TEXT, decks TEXT)')
  d.run('CREATE TABLE notes (id INTEGER, mid INTEGER, flds TEXT, tags TEXT)')
  d.run('CREATE TABLE cards (id INTEGER, nid INTEGER, did INTEGER, ord INTEGER)')
  d.run('INSERT INTO col VALUES (?, ?)', [
    JSON.stringify({ 1: { name: 'Basique', type: 0, tmpls: [{}] }, 3: { name: 'Trous', type: 1, tmpls: [{}] } }),
    JSON.stringify({ 10: { name: 'Linux::Bases' } }),
  ])
  d.run('INSERT INTO notes VALUES (1, 1, ?, ?)', ['Lister les fichiers\x1f<code>ls -la</code>', ' linux '])
  d.run('INSERT INTO notes VALUES (2, 3, ?, ?)', ['Le répertoire {{c1::/etc}} contient la configuration\x1f', ''])
  d.run('INSERT INTO cards VALUES (1, 1, 10, 0)')
  d.run('INSERT INTO cards VALUES (2, 2, 10, 0)')
  const zip = new JSZip()
  zip.file('collection.anki2', d.export())
  zip.file('media', '{}')
  d.close()
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }))
}

/**
 * Enregistre la carte en cours d'édition et attend la fin de l'enregistrement (retour à l'écran précédent).
 * On attend la disparition du bouton « Enregistrer » (présent pour TOUS les types de carte) : attendre
 * celle du champ « Recto » ne marchait pas pour un texte à trous (pas de champ Recto) et laissait le test
 * repartir avant la fin de l'écriture — le retour arrière de l'éditeur le ramenait alors sur « Nouvelle carte ».
 */
export async function saveCard(page: Page) {
  const save = page.getByRole('button', { name: 'Enregistrer', exact: true })
  await save.click()
  await expect(save).toHaveCount(0)
}
