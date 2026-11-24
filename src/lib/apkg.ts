// Import de paquets Anki (.apkg) : archive ZIP contenant une base SQLite (collection.anki2 /
// collection.anki21) et un dossier de médias. Seul le CONTENU est repris (cartes, tags, images) ;
// la planification d'Anki n'est pas convertie : les cartes importées sont « nouvelles ».
import JSZip from 'jszip'
import type { Database, SqlJsStatic } from 'sql.js'
import { db, uid } from '../db'
import type { Card, Note, NoteType } from '../types'
import { autoBackup } from './autobackup'
import { getOrCreateDeckPath } from './decks'
import { makeNote } from './notes'

interface AnkiModel {
  name: string
  /** 0 = standard, 1 = texte à trous */
  type: number
  tmpls: unknown[]
}

export interface ApkgResult {
  decks: number
  notes: number
  cards: number
  images: number
  skipped: number
  safetyBackup: boolean
}

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
}

/** Charge sql.js dans le navigateur (le .wasm est servi par Vite et précaché hors ligne). */
export async function loadSqlJs(): Promise<SqlJsStatic> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
  ])
  return initSqlJs({ locateFile: () => wasmUrl } as unknown as Parameters<typeof initSqlJs>[0])
}

/** HTML d'Anki → Markdown simple (gras, italique, code, retours à la ligne, images). */
export function ankiHtmlToMd(html: string, mediaIdByName: Map<string, string>): string {
  return html
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/<img\b[^>]*?\bsrc=["']?([^"'\s>]+)["']?[^>]*>/gi, (_m, src: string) => {
      const name = decodeURIComponent(src)
      const id = mediaIdByName.get(name)
      return id ? `![](media:${id})` : ''
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li)>/gi, '\n')
    .replace(/<(div|p|ul|ol)\b[^>]*>/gi, '')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<\/?(b|strong)\b[^>]*>/gi, '**')
    .replace(/<\/?(i|em)\b[^>]*>/gi, '*')
    .replace(/<\/?(code|tt)\b[^>]*>/gi, '`')
    .replace(/<\/?(span|font|u)\b[^>]*>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function rows(dbh: Database, sql: string): Record<string, unknown>[] {
  const res = dbh.exec(sql)
  if (!res.length) return []
  const { columns, values } = res[0]
  return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])))
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/**
 * Importe le contenu d'un .apkg. `defaultDeckName` sert quand le paquet source s'appelle « Default ».
 * Lève une erreur au message lisible si le format n'est pas pris en charge.
 */
export async function importApkg(bytes: ArrayBuffer | Uint8Array, SQL: SqlJsStatic, defaultDeckName = 'Import Anki'): Promise<ApkgResult> {
  const zip = await JSZip.loadAsync(bytes)
  let safetyBackup = true
  // collection.anki21 (le plus complet) avant collection.anki2 (parfois un simple message « mettez à jour »).
  const dbFile = zip.file('collection.anki21') ?? zip.file('collection.anki2')
  if (!dbFile) {
    if (zip.file('collection.anki21b')) {
      throw new Error(
        "Ce paquet utilise le nouveau format compressé d'Anki. Dans Anki, ré-exportez-le en cochant « Prise en charge des anciennes versions d'Anki » (.apkg).",
      )
    }
    throw new Error("Fichier .apkg invalide : base de données introuvable.")
  }
  const sqlite = new SQL.Database(new Uint8Array(await dbFile.async('uint8array')))
  try {
    const col = rows(sqlite, 'SELECT models, decks FROM col')[0]
    if (!col) throw new Error('Collection Anki vide ou illisible.')
    const models = JSON.parse(String(col.models)) as Record<string, AnkiModel>
    const ankiDecks = JSON.parse(String(col.decks)) as Record<string, { name: string }>
    const noteRows = rows(sqlite, 'SELECT id, mid, flds, tags FROM notes')
    const cardRows = rows(sqlite, 'SELECT nid, did, ord FROM cards ORDER BY id')

    // Détection du faux paquet de compatibilité d'Anki récent.
    if (noteRows.length === 1 && /update to the latest|mettez à jour/i.test(String(noteRows[0].flds))) {
      throw new Error("Ce paquet a été exporté au nouveau format. Ré-exportez-le depuis Anki avec « Prise en charge des anciennes versions d'Anki ».")
    }

    // Sauvegarde de sécurité une fois le fichier jugé lisible, avant d'écrire quoi que ce soit.
    safetyBackup = await autoBackup('Avant import Anki (.apkg)')

    // Médias : fichier « media » = { "0": "image.png", ... }, contenu dans l'entrée zip « 0 ».
    const mediaIdByName = new Map<string, string>()
    let images = 0
    const mediaEntry = zip.file('media')
    if (mediaEntry) {
      const map = JSON.parse(await mediaEntry.async('string')) as Record<string, string>
      for (const [key, name] of Object.entries(map)) {
        const ext = name.split('.').pop()?.toLowerCase() ?? ''
        const mime = IMAGE_MIME[ext]
        const entry = zip.file(key)
        if (!mime || !entry) continue // sons et vidéos ignorés
        const data = `data:${mime};base64,${toBase64(await entry.async('uint8array'))}`
        const id = uid().replace(/-/g, '').slice(0, 16)
        await db.media.put({ id, name, mime, data })
        mediaIdByName.set(name, id)
        images++
      }
    }

    // Cartes par note : paquet (premier rencontré) et numéros de modèle présents.
    const byNote = new Map<number, { did: string; ords: Set<number> }>()
    for (const c of cardRows) {
      const nid = Number(c.nid)
      const e = byNote.get(nid) ?? { did: String(c.did), ords: new Set<number>() }
      e.ords.add(Number(c.ord))
      byNote.set(nid, e)
    }

    const deckCache = new Map<string, string>()
    const deckIdFor = async (did: string) => {
      const cached = deckCache.get(did)
      if (cached) return cached
      let name = ankiDecks[did]?.name ?? defaultDeckName
      if (/^(default|par défaut)$/i.test(name)) name = defaultDeckName
      const id = (await getOrCreateDeckPath(name)).id
      deckCache.set(did, id)
      return id
    }

    const notes: Note[] = []
    const cards: Card[] = []
    let skipped = 0
    for (const r of noteRows) {
      const model = models[String(r.mid)]
      const info = byNote.get(Number(r.id))
      if (!model || !info) {
        skipped++
        continue
      }
      const fields = String(r.flds).split('\x1f').map((f) => ankiHtmlToMd(f, mediaIdByName))
      let type: NoteType = 'basic'
      let front = fields[0] ?? ''
      let back = fields.slice(1).filter(Boolean).join('\n\n')
      if (model.type === 1) {
        type = 'cloze'
      } else if (model.tmpls.length === 2 && info.ords.has(0) && info.ords.has(1)) {
        type = 'reversed'
      }
      if (type === 'cloze' && !/\{\{c\d+::/.test(front)) {
        skipped++
        continue
      }
      if (type !== 'cloze' && !back && front) back = '—'
      try {
        const m = makeNote({ deckId: await deckIdFor(info.did), type, front, back, tags: String(r.tags ?? '').trim().split(/\s+/) })
        notes.push(m.note)
        cards.push(...m.cards)
      } catch {
        skipped++
      }
    }

    // Écriture par lots pour rester réactif sur de gros paquets.
    const CHUNK = 500
    for (let i = 0; i < notes.length; i += CHUNK) {
      await db.transaction('rw', db.notes, db.cards, async () => {
        await db.notes.bulkAdd(notes.slice(i, i + CHUNK))
      })
    }
    for (let i = 0; i < cards.length; i += CHUNK) await db.cards.bulkAdd(cards.slice(i, i + CHUNK))

    return { decks: deckCache.size, notes: notes.length, cards: cards.length, images, skipped, safetyBackup }
  } finally {
    sqlite.close()
  }
}
