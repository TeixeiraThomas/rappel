import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { makeApkg, openApp, readTable, seed } from './helpers'

const CSV = `recto;verso;tags
Quelle commande affiche la table de routage ?;"\`\`\`
show ip route
\`\`\`";cisco routage
Le protocole {{c1::OSPF}} utilise le numéro {{c2::89}};;cours
Quelle commande affiche les VLAN ?;show vlan brief;cisco
Quelle commande affiche les VLAN ?;show vlan brief;cisco
ligne sans verso
`

test.describe('Import CSV', () => {
  test('aperçu, doublons ignorés, lignes invalides signalées, cartes créées', async ({ page }) => {
    await openApp(page, '/#/settings')
    await expect(page.getByRole('heading', { name: 'Importer un CSV' })).toBeVisible()
    await page.locator('input[type=file][accept*=csv]').setInputFiles({ name: 'reseau.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) })

    await expect(page.getByText('4 cartes valides')).toBeVisible()
    await expect(page.getByText(/1 ligne\(s\) ignorée\(s\)/)).toBeVisible()
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await expect(page.getByText(/3 cartes importées, 1 doublon\(s\) ignoré\(s\)/)).toBeVisible()

    const notes = await readTable<{ front: string; back: string; type: string; tags: string[] }>(page, 'notes')
    expect(notes).toHaveLength(3)
    expect(notes.find((n) => n.type === 'cloze')?.front).toContain('{{c1::OSPF}}')
    expect(notes.find((n) => n.back.includes('show ip route'))?.tags).toEqual(['cisco', 'routage'])
    // Un cloze à 2 trous = 2 cartes → 1 + 2 + 1 = 4 cartes
    expect(await readTable(page, 'cards')).toHaveLength(4)

    // Le paquet porte le nom du fichier
    await page.getByRole('link', { name: 'Paquets' }).click()
    await expect(page.getByRole('button', { name: 'Étudier reseau' })).toBeVisible()
  })

  test('séparateur « , » détecté et fichier vide refusé proprement', async ({ page }) => {
    await openApp(page, '/#/settings')
    await page.locator('input[type=file][accept*=csv]').setInputFiles({ name: 'v.csv', mimeType: 'text/csv', buffer: Buffer.from('recto,verso,tags\nQ,R,t\n') })
    await expect(page.getByText('1 carte valide')).toBeVisible()
    await page.locator('input[type=file][accept*=csv]').setInputFiles({ name: 'vide.csv', mimeType: 'text/csv', buffer: Buffer.from('') })
    await expect(page.getByText('0 carte valide')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Importer', exact: true })).toBeDisabled()
  })
})

test.describe('Sauvegarde JSON', () => {
  test('exporter, tout effacer (avec confirmation), restaurer à l’identique', async ({ page }, testInfo) => {
    await openApp(page)
    await seed(page, [
      { name: 'Réseau', cards: [{ front: 'VLAN ?', back: 'Réseau local virtuel', tags: ['cisco'] }, { front: 'OSPF ?', back: 'Protocole à état de liens' }] },
    ])

    await page.goto('/#/settings')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter', exact: true }).click()])
    expect(download.suggestedFilename()).toMatch(/^rappel-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/)
    const file = testInfo.outputPath('sauvegarde.json')
    await download.saveAs(file)
    const backup = JSON.parse(readFileSync(file, 'utf8'))
    expect(backup).toMatchObject({ format: 'rappel-backup', version: 1 })
    expect(backup.notes).toHaveLength(2)
    expect(backup.cards).toHaveLength(2)

    // Effacement : le dialogue peut être annulé…
    await page.getByRole('button', { name: 'Tout effacer' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click()
    expect(await readTable(page, 'notes')).toHaveLength(2)
    // … puis confirmé
    await page.getByRole('button', { name: 'Tout effacer' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Tout effacer' }).click()
    await expect.poll(async () => (await readTable(page, 'notes')).length).toBe(0)
    // Une sauvegarde automatique a été prise juste avant l'effacement
    await expect(page.getByText('Avant effacement total')).toBeVisible()

    // Restauration du fichier exporté
    await page.locator('input[type=file][accept*=json]').setInputFiles(file)
    await expect(page.getByText(/2 notes, 2 cartes/)).toBeVisible()
    await page.getByRole('button', { name: 'Tout remplacer' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remplacer' }).click()
    await expect.poll(async () => (await readTable(page, 'notes')).length).toBe(2)

    await page.getByRole('link', { name: 'Paquets' }).click()
    await expect(page.getByRole('button', { name: 'Étudier Réseau' })).toBeVisible()
    const fronts = (await readTable<{ front: string }>(page, 'notes')).map((n) => n.front).sort()
    expect(fronts).toEqual(['OSPF ?', 'VLAN ?'])
  })

  test('annuler une restauration grâce à la sauvegarde automatique', async ({ page }, testInfo) => {
    await openApp(page)
    await seed(page, [{ name: 'Original', cards: [{ front: 'original', back: 'x' }] }])
    // Un fichier d'une AUTRE collection
    const other = {
      format: 'rappel-backup', version: 1, exportedAt: new Date().toISOString(),
      decks: [{ id: 'd1', name: 'Autre', parentId: null, created: 1 }],
      notes: [{ id: 'n1', deckId: 'd1', type: 'basic', front: 'autre', back: 'y', tags: [], created: 1, updated: 1 }],
      cards: [{ id: 'c1', noteId: 'n1', deckId: 'd1', ord: 0, due: 1, stability: 0, difficulty: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, state: 0, lastReview: null }],
      reviews: [], media: [], settings: null,
    }
    const { writeFileSync } = await import('node:fs')
    const file = testInfo.outputPath('autre.json')
    writeFileSync(file, JSON.stringify(other))

    await page.goto('/#/settings')
    await page.locator('input[type=file][accept*=json]').setInputFiles(file)
    await page.getByRole('button', { name: 'Tout remplacer' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remplacer' }).click()
    await expect.poll(async () => (await readTable<{ front: string }>(page, 'notes')).map((n) => n.front)).toEqual(['autre'])

    // Retour arrière : « Restaurer » l'instantané pris avant
    await expect(page.getByText('Avant restauration (remplacement)')).toBeVisible()
    await page.getByRole('button', { name: 'Restaurer', exact: true }).first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Restaurer' }).click()
    await expect.poll(async () => (await readTable<{ front: string }>(page, 'notes')).map((n) => n.front)).toEqual(['original'])
  })

  test('un fichier invalide est refusé avec un message clair', async ({ page }) => {
    await openApp(page, '/#/settings')
    await page.locator('input[type=file][accept*=json]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"foo":1}') })
    await expect(page.getByText("Ce fichier n'est pas une sauvegarde Rappel.")).toBeVisible()
    await page.locator('input[type=file][accept*=json]').setInputFiles({ name: 'y.json', mimeType: 'application/json', buffer: Buffer.from('pas du json') })
    await expect(page.getByText("Ce fichier n'est pas un JSON valide.")).toBeVisible()
  })
})

test.describe('Import Anki (.apkg)', () => {
  test('importe cartes, tags, paquets hiérarchiques et trous', async ({ page }) => {
    await openApp(page, '/#/settings')
    await page.locator('input[type=file][accept=".apkg"]').setInputFiles({ name: 'linux.apkg', mimeType: 'application/octet-stream', buffer: await makeApkg() })
    await expect(page.getByText(/2 notes \(2 cartes\) et 0 image\(s\) importées/)).toBeVisible({ timeout: 20_000 })

    const notes = await readTable<{ front: string; back: string; type: string; tags: string[] }>(page, 'notes')
    expect(notes.find((n) => n.type === 'basic')).toMatchObject({ front: 'Lister les fichiers', back: '`ls -la`', tags: ['linux'] })
    expect(notes.find((n) => n.type === 'cloze')?.front).toContain('{{c1::/etc}}')

    await page.getByRole('link', { name: 'Paquets' }).click()
    await expect(page.getByRole('button', { name: 'Étudier Linux', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Étudier Linux::Bases', exact: true })).toBeVisible()
  })

  test('un fichier non pris en charge donne une explication', async ({ page }) => {
    await openApp(page, '/#/settings')
    await page.locator('input[type=file][accept=".apkg"]').setInputFiles({ name: 'cassé.apkg', mimeType: 'application/octet-stream', buffer: Buffer.from('ceci n’est pas un zip') })
    await expect(page.locator('.pill-err')).toBeVisible({ timeout: 20_000 })
  })
})
