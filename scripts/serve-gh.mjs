// Construit l'app comme pour GitHub Pages (base « /rappel/ ») dans dist-gh/, puis la sert en local.
// Sert à vérifier avant déploiement que les chemins de base sont corrects (assets, manifeste,
// service worker, icônes).
// Usage : node scripts/serve-gh.mjs [port]      (BASE_PATH=/autre/ pour changer le sous-dossier)
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = realpathSync.native(join(dirname(fileURLToPath(import.meta.url)), '..'))
process.chdir(root)
const port = process.argv[2] ?? '4174'
const base = process.env.BASE_PATH ?? '/rappel/'
const bin = (n) => join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${n}.cmd` : n)
const run = (cmd, args) =>
  spawnSync(cmd, args, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32', env: { ...process.env, BASE_PATH: base } })

const build = run(bin('vite'), ['build', '--outDir', 'dist-gh', '--emptyOutDir'])
if (build.status !== 0) process.exit(build.status ?? 1)
const preview = run(bin('vite'), ['preview', '--outDir', 'dist-gh', '--port', port, '--strictPort'])
process.exit(preview.status ?? 0)
