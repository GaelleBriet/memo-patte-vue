// @vitest-environment node
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const FEATURE_RULES = [
  '@typescript-eslint/no-restricted-imports',
  'app/no-restricted-dynamic-feature-imports',
]
const LEGACY_RULES = ['no-restricted-imports', 'app/no-restricted-dynamic-imports']

let eslint: ESLint

beforeAll(() => {
  eslint = new ESLint({
    cwd: ROOT,
    ruleFilter: ({ ruleId }) => ruleId.includes('no-restricted'),
    overrideConfig: { languageOptions: { parserOptions: { projectService: false } } },
  })
}, 30_000)

async function lintImports(filePath: string, statements: string[]) {
  const body = statements.join('\n')
  const code = filePath.endsWith('.vue')
    ? `<script setup lang="ts">\n${body}\n</script>\n`
    : `${body}\n`
  const [result] = await eslint.lintText(code, { filePath: `${ROOT}/${filePath}` })
  const messages = result?.messages ?? []
  expect(messages.filter((m) => m.fatal)).toEqual([])
  return {
    feature: messages.filter((m) => FEATURE_RULES.includes(m.ruleId ?? '')).length,
    legacy: messages.filter((m) => LEGACY_RULES.includes(m.ruleId ?? '')).length,
  }
}

async function restrictedImports(filePath: string, imports: string[]) {
  return lintImports(
    filePath,
    imports.map((source, i) => `import * as m${i} from '${source}'`),
  )
}

async function restrictedDynamicImports(filePath: string, imports: string[]) {
  return lintImports(
    filePath,
    imports.map((source, i) => `const m${i} = () => import('${source}')`),
  )
}

describe('imports entre features', { timeout: 30_000 }, () => {
  it("interdit le store d'une autre feature", async () => {
    const result = await restrictedImports('src/features/weight/views/WeightHistoryView.vue', [
      '@/features/vaccinations/store/vaccinations.store',
    ])

    expect(result.feature).toBe(1)
  })

  it('interdit les imports relatifs vers une autre feature et le dossier seul', async () => {
    const result = await restrictedImports('src/features/home/views/HomeView.vue', [
      '../../weight/store/weight.store',
      '../../../features/weight/views/WeightSheet.vue',
      '@/features/weight',
    ])

    expect(result.feature).toBe(3)
  })

  it('autorise un import relatif dans sa propre feature', async () => {
    const result = await restrictedImports('src/features/home/views/HomeView.vue', [
      '../store/home.store',
    ])

    expect(result.feature).toBe(0)
  })

  it('autorise sa propre feature, le store et les types des animaux', async () => {
    const result = await lintImports('src/features/weight/views/WeightHistoryView.vue', [
      "import * as m0 from '@/features/weight/store/weight.store'",
      "import { useAnimalsStore } from '@/features/animals/store/animals.store'",
      "import * as m2 from '@/features/animals/schema/animal.schema'",
    ])

    expect(result.feature).toBe(0)
  })

  it("des animaux, n'autorise que la lecture du store", async () => {
    const other = await lintImports('src/features/weight/views/WeightHistoryView.vue', [
      "import { provideAnimalsRepository } from '@/features/animals/store/animals.store'",
      "import * as m1 from '@/features/animals/store/animals.store'",
    ])
    const own = await lintImports('src/features/animals/views/AnimalFormView.vue', [
      "import { provideAnimalsRepository } from '@/features/animals/store/animals.store'",
    ])

    expect(other.feature).toBe(2)
    expect(own.feature).toBe(0)
  })

  it('autorise sa propre feature et le statut Plus', async () => {
    const result = await lintImports('src/features/weight/views/WeightHistoryView.vue', [
      "import * as m0 from '@/features/weight/store/weight.store'",
      "import { usePurchaseStore } from '@/features/purchase/store/purchase.store'",
    ])

    expect(result.feature).toBe(0)
  })

  it("du statut Plus, n'autorise que la lecture du store", async () => {
    const other = await lintImports('src/features/weight/views/WeightHistoryView.vue', [
      "import { billingService } from '@/features/purchase/store/purchase.store'",
      "import * as m1 from '@/features/purchase/store/purchase.store'",
    ])
    const own = await lintImports('src/features/purchase/views/PlusView.vue', [
      "import * as m0 from '@/features/purchase/store/purchase.store'",
    ])

    expect(other.feature).toBe(2)
    expect(own.feature).toBe(0)
  })

  it('interdit les autres modules des animaux', async () => {
    const result = await restrictedImports('src/features/treatments/views/TreatmentFormView.vue', [
      '@/features/animals/repository/animals.repository',
      '@/features/animals/logic/animal-form',
    ])

    expect(result.feature).toBe(2)
  })

  it("autorise un écran composite à importer sections et feuilles d'autres features", async () => {
    const home = await restrictedImports('src/features/home/views/HomeView.vue', [
      '@/features/weight/views/WeightSheet.vue',
      '@/features/weight/views/WeightSection.vue',
    ])
    const carnet = await restrictedImports('src/features/animals/views/CarnetView.vue', [
      '@/features/treatments/views/TreatmentsSection.vue',
    ])

    expect(home.feature).toBe(0)
    expect(carnet.feature).toBe(0)
  })

  it('autorise un écran composite à lire le statut Plus', async () => {
    const carnet = await lintImports('src/features/animals/views/CarnetView.vue', [
      "import { usePurchaseStore } from '@/features/purchase/store/purchase.store'",
    ])
    const settings = await lintImports('src/features/settings/views/SettingsView.vue', [
      "import { usePurchaseStore } from '@/features/purchase/store/purchase.store'",
    ])

    expect(carnet.feature).toBe(0)
    expect(settings.feature).toBe(0)
  })

  it("interdit à un écran composite le store d'une autre feature", async () => {
    const result = await restrictedImports('src/features/home/views/HomeView.vue', [
      '@/features/weight/store/weight.store',
    ])

    expect(result.feature).toBe(1)
  })

  it("interdit sections et feuilles d'autres features hors écran composite", async () => {
    const result = await restrictedImports('src/features/weight/views/WeightSection.vue', [
      '@/features/vaccinations/views/VaccinationsSection.vue',
      '@/features/home/views/AnimalPickerSheet.vue',
    ])

    expect(result.feature).toBe(2)
  })

  it("autorise un service de cas d'usage à importer repositories et schémas", async () => {
    const result = await restrictedImports('src/features/home/service/home-reminders.service.ts', [
      '@/features/treatments/repository/treatments.repository',
      '@/features/treatments/schema/treatment.schema',
    ])

    expect(result.feature).toBe(0)
  })

  it("interdit à un service le store d'une autre feature", async () => {
    const result = await restrictedImports('src/features/home/service/home-reminders.service.ts', [
      '@/features/treatments/store/treatments.store',
    ])

    expect(result.feature).toBe(1)
  })

  it("interdit à un store ou un repository le repository d'une autre feature", async () => {
    const store = await restrictedImports('src/features/weight/store/weight.store.ts', [
      '@/features/treatments/repository/treatments.repository',
    ])
    const repository = await restrictedImports(
      'src/features/weight/repository/weight.repository.ts',
      ['@/features/treatments/repository/treatments.repository'],
    )

    expect(store.feature).toBe(1)
    expect(repository.feature).toBe(1)
  })

  it('ne contrôle pas les specs', async () => {
    const result = await restrictedImports('src/features/animals/__tests__/CarnetView.spec.ts', [
      '@/features/weight/store/weight.store',
    ])

    expect(result.feature).toBe(0)
  })

  it("garde les interdits d'accès aux données sur les fichiers de features", async () => {
    const result = await restrictedImports('src/features/weight/views/WeightHistoryView.vue', [
      '@/features/vaccinations/store/vaccinations.store',
      '@/core/db/sqlite',
      '@capacitor/local-notifications',
      '@capacitor-community/sqlite',
    ])

    expect(result).toEqual({ feature: 1, legacy: 3 })
  })

  it('garde le plugin de notifications interdit dans un repository', async () => {
    const result = await restrictedImports('src/features/weight/repository/weight.repository.ts', [
      '@/features/treatments/store/treatments.store',
      '@capacitor/local-notifications',
    ])

    expect(result).toEqual({ feature: 1, legacy: 1 })
  })
})

describe('imports dynamiques', { timeout: 30_000 }, () => {
  it("interdit le store d'une autre feature", async () => {
    const result = await restrictedDynamicImports(
      'src/features/weight/views/WeightHistoryView.vue',
      [
        '@/features/vaccinations/store/vaccinations.store',
        '../../home/store/home.store',
        '@/features/vaccinations',
      ],
    )

    expect(result.feature).toBe(3)
  })

  it("interdit l'accès direct aux données depuis une feature", async () => {
    const result = await restrictedDynamicImports(
      'src/features/weight/views/WeightHistoryView.vue',
      [
        '@/core/db/sqlite',
        '@/core/supabase/client',
        '@capacitor-community/sqlite',
        '@capacitor/local-notifications',
      ],
    )

    expect(result.legacy).toBe(4)
  })

  it('interdit à core/ de dépendre des features', async () => {
    const analytics = await restrictedDynamicImports('src/core/analytics/index.ts', [
      '@/features/animals/store/animals.store',
    ])
    const notifications = await restrictedDynamicImports('src/core/notifications/reminder.ts', [
      '@/features/animals/store/animals.store',
    ])

    expect(analytics.legacy).toBe(1)
    expect(notifications.legacy).toBe(1)
  })

  it('autorise ce que les imports statiques autorisent', async () => {
    const view = await restrictedDynamicImports('src/features/weight/views/WeightHistoryView.vue', [
      '../store/weight.store',
      '@/features/animals/store/animals.store',
      '@/shared/domain/reminders',
    ])
    const service = await restrictedDynamicImports(
      'src/features/purchase/service/billing.service.ts',
      ['@revenuecat/purchases-capacitor', '@/features/animals/repository/animals.repository'],
    )
    const dev = await restrictedDynamicImports('src/core/dev/fixtures.ts', [
      '@/features/animals/repository/animals.repository',
    ])

    expect(view).toEqual({ feature: 0, legacy: 0 })
    expect(service).toEqual({ feature: 0, legacy: 0 })
    expect(dev).toEqual({ feature: 0, legacy: 0 })
  })

  it('ne signale pas deux fois un même import statique', async () => {
    const result = await restrictedImports('src/features/weight/views/WeightHistoryView.vue', [
      '@/features/vaccinations/store/vaccinations.store',
      '@/core/db/sqlite',
    ])

    expect(result).toEqual({ feature: 1, legacy: 1 })
  })
})
