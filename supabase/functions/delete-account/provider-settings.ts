import type { ProviderErasure } from './account-erasure.ts'
import { posthogPersonErasure } from './posthog-erasure.ts'
import { revenuecatCustomerErasure } from './revenuecat-erasure.ts'

export const ERASURE_DISABLED = 'disabled'

type Env = (name: string) => string | undefined

type Setting = { name: string; isValid: (value: string) => boolean }

const POSTHOG_SETTINGS = {
  personalApiKey: {
    name: 'POSTHOG_PERSONAL_API_KEY',
    isValid: (value) => value.startsWith('phx_'),
  },
  projectId: { name: 'POSTHOG_PROJECT_ID', isValid: (value) => /^\d+$/.test(value) },
  host: { name: 'POSTHOG_HOST', isValid: isHttpsUrl },
} satisfies Record<string, Setting>

const REVENUECAT_SECRET_KEY: Setting = {
  name: 'REVENUECAT_SECRET_KEY',
  isValid: (value) => value.startsWith('sk_'),
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export type ProviderErasures = {
  providerErasures: ProviderErasure[]
  invalidProviderSettings: string[]
}

/** Un prestataire ne se saute que désactivé en toutes lettres : un secret oublié bloque la suppression. */
export function providerErasuresFrom(env: Env, send: typeof fetch): ProviderErasures {
  const providerErasures: ProviderErasure[] = []
  const invalidProviderSettings: string[] = []

  function read(setting: Setting): string | null {
    const value = env(setting.name)?.trim() ?? ''
    if (setting.isValid(value)) return value
    invalidProviderSettings.push(setting.name)
    return null
  }

  if (env('POSTHOG_ERASURE') !== ERASURE_DISABLED) {
    const personalApiKey = read(POSTHOG_SETTINGS.personalApiKey)
    const projectId = read(POSTHOG_SETTINGS.projectId)
    const host = read(POSTHOG_SETTINGS.host)
    if (personalApiKey && projectId && host) {
      providerErasures.push(posthogPersonErasure({ host, projectId, personalApiKey }, send))
    }
  }

  if (env('REVENUECAT_ERASURE') !== ERASURE_DISABLED) {
    const secretKey = read(REVENUECAT_SECRET_KEY)
    if (secretKey) providerErasures.push(revenuecatCustomerErasure(secretKey, send))
  }

  return { providerErasures, invalidProviderSettings }
}
