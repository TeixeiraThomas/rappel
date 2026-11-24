// Lanceur d'outils (vitest, playwright…) qui corrige la casse du chemin sous Windows.
// Un répertoire courant « c:\... » au lieu de « C:\... » fait charger certains outils en double
// (erreur « Cannot read properties of undefined (reading 'config') »). On se replace donc dans
// le chemin réel avant de lancer la commande.
// Usage : node scripts/run-tool.mjs vitest run
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = realpathSync.native(join(dirname(fileURLToPath(import.meta.url)), '..'))
process.chdir(root)

const [tool, ...args] = process.argv.slice(2)
const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${tool}.cmd` : tool)
const res = spawnSync(bin, args, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' })
process.exit(res.status ?? 1)
