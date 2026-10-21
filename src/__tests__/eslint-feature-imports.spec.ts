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

  it("autorise au schéma du fichier d'export les schémas des autres features, rien d'autre", async () => {
    const schemas = await restrictedImports('src/features/settings/schema/export-file.schema.ts', [
      '@/features/treatments/schema/treatment.schema',
      '@/features/weight/schema/weight.schema',
    ])
    const others = await restrictedImports('src/features/settings/schema/export-file.schema.ts', [
      '@/features/treatments/repository/treatments.repository',
      '@/features/weight/store/weight.store',
    ])
    const elsewhere = await restrictedImports('src/features/settings/schema/other.schema.ts', [
      '@/features/treatments/schema/treatment.schema',
    ])

    expect(schemas.feature).toBe(0)
    expect(others.feature).toBe(2)
    expect(elsewhere.feature).toBe(1)
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

    expect(store.feature).toBe(2)
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

describe('app/, réservé au démarrage', { timeout: 30_000 }, () => {
  it("interdit à un écran, un écran composite, un service et un store d'importer app/", async () => {
    const results = await Promise.all([
      restrictedImports('src/features/weight/views/WeightHistoryView.vue', ['@/app/sync']),
      restrictedImports('src/features/home/views/HomeView.vue', ['@/app/reminders-priming']),
      restrictedImports('src/features/settings/service/data-import.service.ts', [
        '@/app/reminders-sync',
        '../../../app/reminders-sync',
      ]),
      restrictedDynamicImports('src/features/weight/store/weight.store.ts', ['@/app/sync']),
    ])

    expect(results.map(({ feature }) => feature)).toEqual([1, 1, 2, 1])
  })

  it('laisse main.ts brancher app/', async () => {
    const result = await restrictedImports('src/main.ts', ['@/app/sync'])

    expect(result).toEqual({ feature: 0, legacy: 0 })
  })
})

describe('logic/, sans repository', { timeout: 30_000 }, () => {
  it("interdit à logic/ d'importer un repository, de sa feature ou d'une autre", async () => {
    const results = await Promise.all([
      restrictedImports('src/features/treatments/logic/treatment-card.ts', [
        '../repository/treatments.repository',
      ]),
      restrictedImports('src/features/treatments/logic/treatment-card.ts', [
        '@/features/treatments/repository/treatments.repository',
      ]),
      restrictedDynamicImports('src/features/home/logic/todo-items.ts', [
        '../repository/home.repository',
      ]),
      restrictedImports('src/features/home/logic/todo-items.ts', [
        '@/core/device/device.repository',
      ]),
    ])

    expect(results.map(({ feature }) => feature)).toEqual([1, 1, 1, 1])
  })

  it('laisse logic/ importer schémas et modules partagés, et un service son repository', async () => {
    const logic = await restrictedImports('src/features/treatments/logic/treatment-card.ts', [
      '../schema/treatment.schema',
      '@/shared/domain/due-reminders',
    ])
    const service = await restrictedImports(
      'src/features/treatments/service/treatment-doses.service.ts',
      ['../repository/treatments.repository'],
    )

    expect(logic).toEqual({ feature: 0, legacy: 0 })
    expect(service).toEqual({ feature: 0, legacy: 0 })
  })
})

describe('store/, repository en type seulement', { timeout: 30_000 }, () => {
  const STORE = 'src/features/treatments/store/treatments.store.ts'

  it("interdit à un store d'importer un repository en valeur", async () => {
    const results = await Promise.all([
      lintImports(STORE, ["import { provideX } from '../repository/treatments.repository'"]),
      lintImports(STORE, [
        "import * as m from '@/features/treatments/repository/treatments.repository'",
      ]),
      lintImports(STORE, [
        "import { type Repo, provideX } from '../repository/treatments.repository'",
      ]),
      restrictedDynamicImports('src/features/home/store/home.store.ts', [
        '../repository/home.repository',
      ]),
    ])

    expect(results.map(({ feature }) => feature)).toEqual([1, 1, 1, 1])
  })

  it('laisse un store importer un repository avec import type', async () => {
    const results = await Promise.all([
      lintImports(STORE, ["import type { Repo } from '../repository/treatments.repository'"]),
      lintImports(STORE, ["import type * as m from '../repository/treatments.repository'"]),
    ])

    expect(results).toEqual([
      { feature: 0, legacy: 0 },
      { feature: 0, legacy: 0 },
    ])
  })

  it('laisse un service importer son repository en valeur', async () => {
    const result = await restrictedImports(
      'src/features/treatments/service/treatment-doses.service.ts',
      ['../repository/treatments.repository'],
    )

    expect(result).toEqual({ feature: 0, legacy: 0 })
  })
})

describe('app/ hors de shared/ et de core/', { timeout: 30_000 }, () => {
  it("interdit à shared/ et à core/ d'importer app/", async () => {
    const results = await Promise.all([
      restrictedImports('src/shared/utils/format.ts', ['@/app/sync']),
      restrictedImports('src/shared/domain/due-reminders.ts', ['@/app/sync']),
      restrictedImports('src/core/db/sqlite.ts', ['@/app/sync']),
      restrictedImports('src/core/notifications/reminder.ts', ['@/app/sync']),
      restrictedImports('src/core/dev/fixtures.ts', ['@/app/sync']),
      restrictedImports('src/core/device/device.repository.ts', ['@/app/sync']),
      restrictedImports('src/core/device/device.repository.ts', [
        '@/features/animals/store/animals.store',
      ]),
      restrictedDynamicImports('src/shared/composables/use-x.ts', ['@/app/sync']),
    ])

    expect(results.map(({ feature, legacy }) => feature + legacy)).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
  })

  it('laisse app/ importer app/', async () => {
    const result = await restrictedImports('src/app/sync.ts', ['@/app/reminders-sync'])

    expect(result).toEqual({ feature: 0, legacy: 0 })
  })
})

describe('façade du moteur des doses', { timeout: 30_000 }, () => {
  async function engineImports(filePath: string, statements: string[]) {
    const [result] = await eslint.lintText(`${statements.join('\n')}\n`, {
      filePath: `${ROOT}/${filePath}`,
    })
    const messages = result?.messages ?? []
    expect(messages.filter((m) => m.fatal)).toEqual([])
    return messages.filter((m) => m.ruleId === 'app/no-restricted-engine-imports').length
  }

  it('interdit les fichiers internes du moteur hors du moteur', async () => {
    const feature = await engineImports('src/features/treatments/logic/treatment-plan.ts', [
      "import { buildView } from '@/shared/domain/dose-calendar/view'",
      "const m = () => import('@/shared/domain/dose-calendar/gestures/note')",
    ])
    const shared = await engineImports('src/shared/domain/reminder-plan.ts', [
      "import { buildView } from './dose-calendar/view'",
    ])
    const component = await engineImports('src/shared/utils/format.ts', [
      "import { buildView } from '../domain/dose-calendar/view'",
    ])
    const nested = await engineImports('src/shared/domain/reminders/plan.ts', [
      "import { buildView } from '../dose-calendar/view'",
      "import { keyOf } from '@/shared/domain/dose-calendar/lines'",
    ])

    expect(feature).toBe(2)
    expect(shared).toBe(1)
    expect(component).toBe(1)
    expect(nested).toBe(2)
  })

  it('autorise la façade, et les fichiers internes entre eux', async () => {
    const feature = await engineImports('src/features/treatments/logic/treatment-plan.ts', [
      "import { treatmentView } from '@/shared/domain/dose-calendar'",
    ])
    const shared = await engineImports('src/shared/domain/treatment-reading.ts', [
      "import { treatmentView } from './dose-calendar'",
    ])
    const engine = await engineImports('src/shared/domain/dose-calendar/gestures/note.ts', [
      "import { buildView } from '../view'",
    ])
    const spec = await engineImports('src/shared/__tests__/dose-calendar.view.spec.ts', [
      "import { buildView } from '../domain/dose-calendar/view'",
    ])

    expect([feature, shared, engine, spec]).toEqual([0, 0, 0, 0])
  })
})

describe('services sans interface', { timeout: 30_000 }, () => {
  const SERVICE = 'src/features/treatments/service/reminder-actions.service.ts'

  async function interfaceImports(filePath: string, statements: string[]) {
    const [result] = await eslint.lintText(`${statements.join('\n')}\n`, {
      filePath: `${ROOT}/${filePath}`,
    })
    const messages = result?.messages ?? []
    expect(messages.filter((m) => m.fatal)).toEqual([])
    return messages.filter((m) => m.ruleId === 'app/no-restricted-interface-imports').length
  }

  it("interdit à un service le toast, les composables, Vuetify, vue-i18n et les composants d'écran", async () => {
    const count = await interfaceImports(SERVICE, [
      "import { showToast } from '@/shared/utils/toast'",
      "import { confirmUndoable } from '@/shared/composables/use-guarded-gestures'",
      "import { useI18n } from 'vue-i18n'",
      "import { useDisplay } from 'vuetify'",
      "import Sheet from '../views/TreatmentSheet.vue'",
      "const lazy = () => import('@/shared/utils/toast')",
    ])

    expect(count).toBe(6)
  })

  it("autorise ce qu'un service importe sans connaître l'interface", async () => {
    const count = await interfaceImports(SERVICE, [
      "import type { Router } from 'vue-router'",
      "import { watch } from 'vue'",
      "import type { Translate } from '@/core/i18n/translate'",
      "import { formatDayMonthOrYear } from '@/shared/utils/format'",
    ])
    const view = await interfaceImports('src/features/treatments/views/TreatmentSheet.vue', [
      "import { showToast } from '@/shared/utils/toast'",
    ])

    expect(count).toBe(0)
    expect(view).toBe(0)
  })

  it("garde les autres interdits d'un service actifs", async () => {
    const result = await restrictedImports(SERVICE, [
      '@supabase/supabase-js',
      '@/features/vaccinations/store/vaccinations.store',
    ])

    expect(result).toEqual({ feature: 1, legacy: 1 })
  })
})
