// @vitest-environment node
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const FEATURE_RULE = '@typescript-eslint/no-restricted-imports'
const LEGACY_RULE = 'no-restricted-imports'

let eslint: ESLint

beforeAll(() => {
  eslint = new ESLint({ cwd: ROOT })
}, 30_000)

async function restrictedImports(filePath: string, imports: string[]) {
  const statements = imports.map((source, i) => `import * as m${i} from '${source}'`).join('\n')
  const code = filePath.endsWith('.vue')
    ? `<script setup lang="ts">\n${statements}\n</script>\n`
    : `${statements}\n`
  const [result] = await eslint.lintText(code, { filePath: `${ROOT}/${filePath}` })
  const messages = result?.messages ?? []
  return {
    feature: messages.filter((m) => m.ruleId === FEATURE_RULE).length,
    legacy: messages.filter((m) => m.ruleId === LEGACY_RULE).length,
  }
}

describe('imports entre features', { timeout: 30_000 }, () => {
  it("interdit le store d'une autre feature", async () => {
    const result = await restrictedImports('src/features/weight/WeightHistoryView.vue', [
      '@/features/vaccinations/vaccinations.store',
    ])

    expect(result.feature).toBe(1)
  })

  it('autorise sa propre feature, le store et les types des animaux', async () => {
    const result = await restrictedImports('src/features/weight/WeightHistoryView.vue', [
      '@/features/weight/weight.store',
      '@/features/animals/animals.store',
      '@/features/animals/animal.schema',
    ])

    expect(result.feature).toBe(0)
  })

  it('interdit les autres modules des animaux', async () => {
    const result = await restrictedImports('src/features/treatments/TreatmentFormView.vue', [
      '@/features/animals/animals.repository',
      '@/features/animals/animal-form',
    ])

    expect(result.feature).toBe(2)
  })

  it("autorise un écran composite à importer sections et feuilles d'autres features", async () => {
    const home = await restrictedImports('src/features/home/HomeView.vue', [
      '@/features/weight/WeightSheet.vue',
      '@/features/weight/WeightSection.vue',
    ])
    const carnet = await restrictedImports('src/features/animals/CarnetView.vue', [
      '@/features/treatments/TreatmentsSection.vue',
    ])

    expect(home.feature).toBe(0)
    expect(carnet.feature).toBe(0)
  })

  it("interdit à un écran composite le store d'une autre feature", async () => {
    const result = await restrictedImports('src/features/home/HomeView.vue', [
      '@/features/weight/weight.store',
    ])

    expect(result.feature).toBe(1)
  })

  it("interdit sections et feuilles d'autres features hors écran composite", async () => {
    const result = await restrictedImports('src/features/weight/WeightSection.vue', [
      '@/features/vaccinations/VaccinationsSection.vue',
      '@/features/home/AnimalPickerSheet.vue',
    ])

    expect(result.feature).toBe(2)
  })

  it("autorise un service de cas d'usage à importer repositories et schémas", async () => {
    const result = await restrictedImports('src/features/home/home-reminders.service.ts', [
      '@/features/treatments/treatments.repository',
      '@/features/treatments/treatment.schema',
    ])

    expect(result.feature).toBe(0)
  })

  it("interdit à un service le store d'une autre feature", async () => {
    const result = await restrictedImports('src/features/home/home-reminders.service.ts', [
      '@/features/treatments/treatments.store',
    ])

    expect(result.feature).toBe(1)
  })

  it("interdit à un store ou un repository le repository d'une autre feature", async () => {
    const store = await restrictedImports('src/features/weight/weight.store.ts', [
      '@/features/treatments/treatments.repository',
    ])
    const repository = await restrictedImports('src/features/weight/weight.repository.ts', [
      '@/features/treatments/treatments.repository',
    ])

    expect(store.feature).toBe(1)
    expect(repository.feature).toBe(1)
  })

  it('ne contrôle pas les specs', async () => {
    const result = await restrictedImports('src/features/animals/__tests__/CarnetView.spec.ts', [
      '@/features/weight/weight.store',
    ])

    expect(result.feature).toBe(0)
  })

  it("garde les interdits d'accès aux données sur les fichiers de features", async () => {
    const result = await restrictedImports('src/features/weight/WeightHistoryView.vue', [
      '@/features/vaccinations/vaccinations.store',
      '@/core/db/sqlite',
      '@capacitor/local-notifications',
      '@capacitor-community/sqlite',
    ])

    expect(result).toEqual({ feature: 1, legacy: 3 })
  })

  it('garde le plugin de notifications interdit dans un repository', async () => {
    const result = await restrictedImports('src/features/weight/weight.repository.ts', [
      '@/features/treatments/treatments.store',
      '@capacitor/local-notifications',
    ])

    expect(result).toEqual({ feature: 1, legacy: 1 })
  })
})
