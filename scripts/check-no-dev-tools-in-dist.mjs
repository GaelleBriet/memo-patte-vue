// Vérifie qu'aucun outil de développement ne part en production : ni les fixtures
// (`src/core/dev/`), ni le statut Plus simulé (`dev-plus-status.ts`), ni la SQLite du
// navigateur (`jeep-sqlite`, `sql-wasm.wasm`).
// Lit le `dist/` déjà produit, sans relancer de build : `pnpm build-only && pnpm test:build`.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const DIST = 'dist'
const ASSETS = join(DIST, 'assets')

/**
 * Marqueurs techniques uniquement, jamais les noms du carnet de démo : un placeholder
 * légitime (« Ex. Milo », « Ex. Bravecto ») les reprend. `memo-patte:demo-carnet` est
 * `DEMO_CARNET_MARKER` (`src/core/dev/demo-carnet.ts`), lu à l'exécution par les fixtures ;
 * `memo-patte:dev-plus-status` est `DEV_PLUS_STATUS_MARKER`, lu par le statut Plus simulé.
 */
const DEV_MARKERS = [
  'memo-patte:demo-carnet',
  'memo-patte:fixtures-token',
  'memo-patte:dev-plus-status',
]
const DEV_CHUNK = /fixtures|demo-carnet|dev-plus-status/

/**
 * Pas `jeep-sqlite` : le plugin SQLite web, légitime dans le build, cite ce nom.
 * `parseWasmPath` est un watcher du composant, propre au chunk `loader-*.js` de jeep-sqlite.
 */
const WEB_SQLITE_MARKERS = ['sql-wasm.wasm', 'parseWasmPath']
const WEB_SQLITE_FILE = /jeep-sqlite|\.wasm$/

if (!existsSync(ASSETS)) {
  console.error(`✗ ${ASSETS} introuvable : lancer \`pnpm build-only\` avant \`pnpm test:build\`.`)
  process.exit(1)
}

const allFiles = readdirSync(DIST, { withFileTypes: true, recursive: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name))

const codeFiles = allFiles.filter((file) => file.startsWith(ASSETS) && /\.(js|css)$/.test(file))

const failures = []
for (const file of allFiles) {
  const name = relative(DIST, file)
  if (WEB_SQLITE_FILE.test(name)) failures.push(`${name} : SQLite du navigateur dans le build`)
}

for (const file of codeFiles) {
  const name = relative(DIST, file)
  if (DEV_CHUNK.test(name)) failures.push(`${name} : chunk de dev présent dans le build`)

  const content = readFileSync(file, 'utf8')
  for (const marker of [...DEV_MARKERS, ...WEB_SQLITE_MARKERS]) {
    if (content.includes(marker)) failures.push(`${name} : « ${marker} » trouvé`)
  }
}

if (codeFiles.length === 0) failures.push(`${ASSETS} : aucun fichier .js ou .css à vérifier`)

if (failures.length > 0) {
  console.error('✗ Des outils de développement sont partis dans le build de production :')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

process.stdout.write(
  `✓ Ni fixtures, ni statut Plus simulé, ni SQLite du navigateur dans les ${allFiles.length} fichiers de ${DIST}\n`,
)
