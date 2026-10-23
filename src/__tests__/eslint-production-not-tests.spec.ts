// @vitest-environment node
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

let eslint: ESLint

beforeAll(() => {
  eslint = new ESLint({
    cwd: ROOT,
    ruleFilter: ({ ruleId }) => ruleId.includes('no-restricted'),
    overrideConfig: { languageOptions: { parserOptions: { projectService: false } } },
  })
}, 30_000)

async function restricted(filePath: string, code: string) {
  const [result] = await eslint.lintText(`${code}\n`, { filePath: `${ROOT}/${filePath}` })
  const messages = result?.messages ?? []
  expect(messages.filter((m) => m.fatal)).toEqual([])
  return messages.length
}

describe('la production n’importe pas de __tests__/', { timeout: 30_000 }, () => {
  it('refuse à un fichier de production d’importer un module de __tests__/', async () => {
    const results = await Promise.all([
      restricted(
        'src/features/animals/logic/uses-evil.ts',
        "import { x } from '@/features/animals/__tests__/evil.local.spec'",
      ),
      restricted(
        'src/features/animals/logic/uses-evil.ts',
        "import { x } from '../__tests__/evil'",
      ),
      restricted(
        'src/features/animals/logic/uses-evil.ts',
        "export { x } from '../__tests__/evil.local.spec'",
      ),
      restricted(
        'src/features/animals/logic/uses-evil.ts',
        "const m = () => import('../__tests__/evil')",
      ),
      restricted(
        'src/shared/components/Evil.vue',
        '<script setup lang="ts">\nimport { x } from \'../__tests__/evil\'\n</script>',
      ),
    ])

    expect(results).toEqual([1, 1, 1, 1, 1])
  })

  it('laisse un test importer un module de __tests__/', async () => {
    const results = await Promise.all([
      restricted(
        'src/features/animals/__tests__/a.spec.ts',
        "import { x } from './fixtures/evil'\nimport { y } from '../__tests__/evil'",
      ),
      restricted('src/features/animals/logic/a.spec.ts', "import { x } from '../__tests__/evil'"),
    ])

    expect(results).toEqual([0, 0])
  })

  it('laisse la production importer un autre module', async () => {
    const result = await restricted(
      'src/features/animals/logic/a.ts',
      "import { x } from './b'\nimport { y } from '@/shared/domain/weight-delta'",
    )

    expect(result).toBe(0)
  })
})
