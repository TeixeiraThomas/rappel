import type { Page } from '@playwright/test'

/** Vieillit les notes de N jours (pour tester le rappel de sauvegarde). */
export async function ageNotes(page: Page, days: number) {
  await page.evaluate(async (days) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('rappel')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = db.transaction('notes', 'readwrite')
    const store = tx.objectStore('notes')
    const all: { created: number; updated: number }[] = await new Promise((res) => {
      const r = store.getAll()
      r.onsuccess = () => res(r.result)
    })
    for (const n of all) store.put({ ...n, created: n.created - days * 86_400_000, updated: n.updated - days * 86_400_000 })
    await new Promise<void>((res) => (tx.oncomplete = () => res()))
    db.close()
  }, days)
}
