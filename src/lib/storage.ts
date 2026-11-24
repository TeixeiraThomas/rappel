// Stockage persistant : demande au navigateur de ne pas purger les données locales (IndexedDB)
// quand l'espace disque manque ou après une longue inactivité (surtout iOS Safari).

export interface StorageInfo {
  /** API disponible dans ce navigateur. */
  supported: boolean
  persisted: boolean
  /** Octets utilisés / quota estimé (null si inconnu). */
  usage: number | null
  quota: number | null
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const s = typeof navigator !== 'undefined' ? navigator.storage : undefined
  if (!s) return { supported: false, persisted: false, usage: null, quota: null }
  const [persisted, est] = await Promise.all([
    s.persisted?.().catch(() => false) ?? false,
    s.estimate?.().catch(() => null) ?? null,
  ])
  return { supported: true, persisted, usage: est?.usage ?? null, quota: est?.quota ?? null }
}

/** Demande la persistance ; renvoie l'état obtenu. Sans effet si déjà accordée. */
export async function requestPersistence(): Promise<boolean> {
  const s = typeof navigator !== 'undefined' ? navigator.storage : undefined
  if (!s?.persist) return false
  try {
    if (await s.persisted?.()) return true
    return await s.persist()
  } catch {
    return false
  }
}

/** Taille lisible : « 12,4 Mo ». */
export function formatBytes(n: number | null): string {
  if (n === null) return '—'
  const units = ['o', 'Ko', 'Mo', 'Go']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${(Math.round(v * 10) / 10).toString().replace('.', ',')} ${units[i]}`
}
