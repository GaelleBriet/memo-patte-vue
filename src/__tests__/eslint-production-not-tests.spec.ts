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

const PROD = 'src/features/animals/logic/uses-evil.ts'

describe('la production n’importe pas de specs', { timeout: 30_000 }, () => {
  it.each([
    './evil.repository.spec',
    './evil.spec.ts',
    './evil.test',
    './evil.test.ts',
    '@/features/animals/logic/evil.spec',
  ])('refuse %s', async (source) => {
    expect(await restricted(PROD, `import { x } from '${source}'`)).toBe(1)
  })

  it('refuse le dossier __tests__ lui-même', async () => {
    expect(await restricted(PROD, "import { x } from '../__tests__'")).toBe(1)
  })

  it('refuse l’import dans un fichier .mts ou .tsx de production', async () => {
    const results = await Promise.all([
      restricted('src/features/animals/logic/a.mts', "import { x } from './b.spec'"),
      restricted('src/features/animals/logic/a.tsx', "import { x } from './b.spec'"),
    ])
    expect(results).toEqual([1, 1])
  })

  it('laisse un fichier .test.ts importer un module de __tests__/', async () => {
    expect(
      await restricted(
        'src/features/animals/logic/a.test.ts',
        "import { x } from '../__tests__/evil'\nimport { y } from './b.spec'",
      ),
    ).toBe(0)
  })
})

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

describe(
  'la production n’embarque pas de test par glob ou import calculé',
  { timeout: 30_000 },
  () => {
    it.each([
      "import.meta.glob('../__tests__/*.ts')",
      "import.meta.glob(['./ok/*.ts', '../__tests__/**/*.ts'])",
      "import.meta.glob('./*.spec.ts')",
      "import.meta.glob('./**/*.test.*', { eager: true })",
      'const m = (n: string) => import(`../__tests__/${n}`)',
      'const m = (n: string) => import(`../__tests__${n}`)',
      'const m = () => import(`../__tests__/evil`)',
      'const m = (n: string) => import(`./${n}.spec`)',
      'const m = (n: string) => import(`./${n}.spec.ts`)',
      'const m = (n: string) => import(`./${n}.test.ts`)',
      "import.meta.glob('./**/*.ts')",
      "import.meta.glob('../**/*')",
      "import.meta.glob('./**/*.{spec,test}.ts')",
      "import.meta.glob('./**/*.spec*')",
      "import.meta.glob('../__test*/**')",
      "import.meta.glob(['./**/*.ts', '!**/__tests__/**'])",
    ])('refuse %s', async (code) => {
      expect(await restricted(PROD, code)).toBe(1)
    })

    it.each([
      "import.meta.glob('../__tests__/*.ts')",
      'const m = (n: string) => import(`../__tests__/${n}`)',
      "import.meta.glob('./**/*.ts')",
    ])('laisse un test ou un spec utiliser %s', async (code) => {
      const results = await Promise.all([
        restricted('src/features/animals/__tests__/a.ts', code),
        restricted('src/features/animals/logic/a.spec.ts', code),
      ])
      expect(results).toEqual([0, 0])
    })

    it.each([
      "import.meta.glob('./icons/*.svg')",
      "import.meta.glob(['./icons/*.svg', '!./icons/x.svg'])",
      'const m = (n: string) => import(`./icons/${n}.svg`)',
      'const m = (n: string) => import(n)',
      'const m = (n: string) => import(`./${n}.vue`)',
      "import.meta.glob('./*.ts')",
      "import.meta.glob(['./**/*.ts', '!**/__tests__/**', '!**/*.{spec,test}.*'])",
    ])('laisse la production utiliser %s', async (code) => {
      expect(await restricted(PROD, code)).toBe(0)
    })
  },
)
