// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * TEST LENT : lance un vrai `vite build` (de l'ordre de 10 à 30 s) dans un
 * dossier temporaire, pour prouver que `import.meta.env.DEV` fait bien tomber
 * `src/core/dev/` du bundle de production. Rien du carnet de démo ne doit
 * partir en prod.
 */

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const BUILD_TIMEOUT_MS = 180_000

/** Placeholder du formulaire animal (`fr.json`) : la seule occurrence légitime de « Milo » en prod. */
const LEGITIMATE_MILO = 'Ex. Milo'
const DEMO_MARKERS = ['Luna', 'CHPPi', 'Bravecto', 'Milbemax', 'memo-patte:fixtures-token']

function buildInto(outDir: string): void {
  // Vitest pose `NODE_ENV=test`, que Vite lirait comme « pas production » et
  // garderait alors `import.meta.env.DEV` vrai : on rejoue l'environnement
  // d'un `pnpm build-only` lancé depuis un terminal.
  const { NODE_ENV: _nodeEnv, VITEST: _vitest, VITE_FIXTURES: _fixtures, ...env } = process.env
  execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: ROOT,
    env,
    stdio: 'pipe',
    timeout: BUILD_TIMEOUT_MS,
  })
}

function readBundle(outDir: string): { files: string[]; content: string } {
  const files = readdirSync(join(outDir, 'assets'), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(js|css)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
  return { files, content: files.map((file) => readFileSync(file, 'utf8')).join('\n') }
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('build de production', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'memo-patte-dist-'))

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true })
  })

  it(
    'ne contient aucune trace des fixtures de développement',
    () => {
      buildInto(outDir)
      const { files, content } = readBundle(outDir)

      expect(files.length).toBeGreaterThan(0)
      expect(files.some((file) => /fixtures|demo-carnet/.test(file))).toBe(false)
      expect(count(content, 'Milo')).toBe(count(content, LEGITIMATE_MILO))
      for (const marker of DEMO_MARKERS) {
        expect(content, `« ${marker} » trouvé dans le bundle`).not.toContain(marker)
      }
    },
    BUILD_TIMEOUT_MS,
  )
})
