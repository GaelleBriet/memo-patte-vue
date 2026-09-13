// Vérifie qu'aucune trace des fixtures de développement (`src/core/dev/`) ne part
// en production. Lit le `dist/` déjà produit par `pnpm build` / `pnpm build-only`,
// sans relancer de build : `pnpm build-only && pnpm test:build`.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const DIST = 'dist'
const ASSETS = join(DIST, 'assets')

/**
 * Marqueurs techniques uniquement, jamais les noms du carnet de démo : un placeholder
 * légitime (« Ex. Milo », « Ex. Bravecto ») les reprend. `memo-patte:demo-carnet` est
 * `DEMO_CARNET_MARKER` (`src/core/dev/demo-carnet.ts`), lu à l'exécution par les fixtures.
 */
const DEV_MARKERS = ['memo-patte:demo-carnet', 'memo-patte:fixtures-token']
const DEV_CHUNK = /fixtures|demo-carnet/

if (!existsSync(ASSETS)) {
  console.error(`✗ ${ASSETS} introuvable : lancer \`pnpm build-only\` avant \`pnpm test:build\`.`)
  process.exit(1)
}

const files = readdirSync(ASSETS, { withFileTypes: true, recursive: true })
  .filter((entry) => entry.isFile() && /\.(js|css)$/.test(entry.name))
  .map((entry) => join(entry.parentPath, entry.name))

const failures = []
for (const file of files) {
  const name = relative(DIST, file)
  if (DEV_CHUNK.test(name)) failures.push(`${name} : chunk des fixtures présent dans le build`)

  const content = readFileSync(file, 'utf8')
  for (const marker of DEV_MARKERS) {
    if (content.includes(marker)) failures.push(`${name} : « ${marker} » trouvé`)
  }
}

if (files.length === 0) failures.push(`${ASSETS} : aucun fichier .js ou .css à vérifier`)

if (failures.length > 0) {
  console.error(
    '✗ Des traces des fixtures de développement sont parties dans le build de production :',
  )
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

process.stdout.write(
  `✓ Aucune trace des fixtures de développement dans ${files.length} fichiers de ${ASSETS}\n`,
)
