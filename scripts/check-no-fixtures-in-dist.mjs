// Vérifie qu'aucune trace des fixtures de développement (`src/core/dev/`) ne part
// en production. Lit le `dist/` déjà produit par `pnpm build` / `pnpm build-only`,
// sans relancer de build : `pnpm build-only && pnpm test:build`.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const DIST = 'dist'
const ASSETS = join(DIST, 'assets')

/** Placeholder du formulaire animal (`fr.json`) : la seule occurrence légitime de « Milo » en prod. */
const LEGITIMATE_MILO = 'Ex. Milo'
const DEMO_MARKERS = ['Luna', 'CHPPi', 'Bravecto', 'Milbemax', 'memo-patte:fixtures-token']
const DEMO_CHUNK = /fixtures|demo-carnet/

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
  if (DEMO_CHUNK.test(name)) failures.push(`${name} : chunk des fixtures présent dans le build`)

  const content = readFileSync(file, 'utf8')
  const strayMilo = content.split('Milo').length - content.split(LEGITIMATE_MILO).length
  if (strayMilo > 0)
    failures.push(`${name} : « Milo » trouvé ${strayMilo} fois hors « ${LEGITIMATE_MILO} »`)
  for (const marker of DEMO_MARKERS) {
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
