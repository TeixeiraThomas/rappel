import { db, uid } from '../db'

// Les images sont stockées dans IndexedDB (table « media ») sous forme de data URL,
// et référencées dans le Markdown par « media:ID » (ex. ![schéma](media:abc123)).

const cache = new Map<string, string>()
const MAX_SIDE = 1280

export function mediaUrl(id: string): string | undefined {
  return cache.get(id)
}

/** Charge en mémoire les images demandées ; renvoie true si de nouvelles images sont disponibles. */
export async function loadMedia(ids: string[]): Promise<boolean> {
  const missing = ids.filter((id) => !cache.has(id))
  if (!missing.length) return false
  const rows = await db.media.bulkGet(missing)
  let changed = false
  rows.forEach((row, i) => {
    if (row) {
      cache.set(missing[i], row.data)
      changed = true
    } else {
      cache.set(missing[i], '') // image absente : évite de requêter en boucle
    }
  })
  return changed
}

/** Remplace media:ID par la data URL correspondante dans un fragment HTML. */
export function substituteMedia(html: string): string {
  return html.replace(/media:([A-Za-z0-9_-]+)/g, (all, id: string) => cache.get(id) || all)
}

export function clearMediaCache(): void {
  cache.clear()
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** Redimensionne (≤ 1280 px) et compresse une image ; GIF/SVG restent intacts. */
async function compress(file: File): Promise<{ data: string; mime: string }> {
  if (/gif|svg/.test(file.type)) return { data: await readAsDataUrl(file), mime: file.type }
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    // WebP si le navigateur sait l'encoder, sinon PNG (transparence) ou JPEG.
    let data = canvas.toDataURL('image/webp', 0.85)
    if (!data.startsWith('data:image/webp')) {
      data = file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85)
    }
    return { data, mime: data.slice(5, data.indexOf(';')) }
  } catch {
    return { data: await readAsDataUrl(file), mime: file.type || 'image/png' }
  }
}

/** Ajoute une image et renvoie le Markdown à insérer. */
export async function addImage(file: File): Promise<string> {
  const { data, mime } = await compress(file)
  const id = uid().replace(/-/g, '').slice(0, 16)
  await db.media.put({ id, name: file.name || 'image', mime, data })
  cache.set(id, data)
  return `![${(file.name || 'image').replace(/\.[^.]+$/, '').replace(/[\[\]]/g, '')}](media:${id})`
}
