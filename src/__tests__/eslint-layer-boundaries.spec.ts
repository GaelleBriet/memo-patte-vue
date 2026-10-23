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

const DOMAIN = 'src/shared/domain/weight-delta.ts'

describe('shared/, sans feature', { timeout: 30_000 }, () => {
  it('interdit à shared/ d’importer une feature', async () => {
    const results = await Promise.all([
      restricted(
        'src/shared/utils/format.ts',
        "import * as m from '@/features/weight/store/weight.store'",
      ),
      restricted(
        'src/shared/components/SurfaceCard.vue',
        '<script setup lang="ts">\nimport * as m from \'../../features/weight/logic/x\'\n</script>',
      ),
      restricted(
        'src/shared/domain/weight-delta.ts',
        "const m = () => import('@/features/weight/logic/x')",
      ),
    ])

    expect(results).toEqual([1, 1, 1])
  })

  it('laisse un test de shared/ importer une feature', async () => {
    const result = await restricted(
      'src/shared/__tests__/import-plan.spec.ts',
      "import * as m from '@/features/settings/__tests__/import-fixture'",
    )

    expect(result).toBe(0)
  })

  it('laisse shared/ importer core/ et shared/', async () => {
    const result = await restricted(
      'src/shared/utils/format.ts',
      "import type { AppLocale } from '@/core/i18n'\nimport * as b from '@/shared/domain/weight-delta'",
    )

    expect(result).toBe(0)
  })
})

describe('shared/domain/, sans téléphone ni état', { timeout: 30_000 }, () => {
  it('interdit un plugin Capacitor, pinia et vuetify', async () => {
    const results = await Promise.all([
      restricted(DOMAIN, "import { Filesystem } from '@capacitor/filesystem'"),
      restricted(DOMAIN, "import { defineStore } from 'pinia'"),
      restricted(DOMAIN, "import { useDisplay } from 'vuetify'"),
      restricted(DOMAIN, "const m = () => import('@capacitor/app')"),
      restricted(DOMAIN, "import { FileOpener } from '@capawesome-team/capacitor-file-opener'"),
      restricted(DOMAIN, "import { Purchases } from '@revenuecat/purchases-capacitor'"),
      restricted(DOMAIN, "import { NativeSettings } from 'capacitor-native-settings'"),
      restricted(DOMAIN, "import { storeToRefs } from 'pinia/dist/pinia'"),
      restricted(DOMAIN, "import type { Directory } from '@capacitor/filesystem'"),
      restricted(DOMAIN, "import { CapacitorSQLite } from '@capacitor-community/sqlite'"),
    ])

    expect(results).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
  })

  it('laisse shared/domain/ importer vue-router en type, core/ et date-fns', async () => {
    const result = await restricted(
      DOMAIN,
      "import type { RouteLocationRaw } from 'vue-router'\nimport type { AppLocale } from '@/core/i18n'\nimport { addDays } from 'date-fns'",
    )

    expect(result).toBe(0)
  })

  it('laisse un autre dossier de shared/ ou de core/ appeler le téléphone', async () => {
    const utils = await restricted(
      'src/shared/utils/toast.ts',
      "import { Haptics } from '@capacitor/haptics'",
    )
    const core = await restricted(
      'src/core/device/system-apps.ts',
      "import { App } from '@capacitor/app'",
    )

    expect(utils).toBe(0)
    expect(core).toBe(0)
  })
})

describe('accès aux données réservé aux repositories et à leurs tests', { timeout: 30_000 }, () => {
  const SUPABASE = "import { createClient } from '@supabase/supabase-js'"
  const KINDS = ['local', 'integration', 'repository', 'service']

  it('laisse un test de __tests__/ ouvrir Supabase', async () => {
    const results = await Promise.all(
      KINDS.map((kind) =>
        restricted(`src/features/auth/__tests__/password-update.${kind}.spec.ts`, SUPABASE),
      ),
    )

    expect(results).toEqual([0, 0, 0, 0])
  })

  it('refuse le même test hors de __tests__/', async () => {
    const results = await Promise.all(
      KINDS.map((kind) =>
        restricted(`src/features/auth/logic/password-update.${kind}.spec.ts`, SUPABASE),
      ),
    )

    expect(results).toEqual([1, 1, 1, 1])
  })
})
