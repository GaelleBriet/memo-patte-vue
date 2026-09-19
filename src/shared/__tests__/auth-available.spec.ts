// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import { authAvailable } from '../auth-available'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('authAvailable', () => {
  it('ouvre le parcours compte quand Supabase est configuré', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://memopatte.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')

    expect(authAvailable()).toBe(true)
  })

  it.each(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'])(
    'le ferme quand %s manque',
    (manquante) => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://memopatte.supabase.co')
      vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
      vi.stubEnv(manquante, '')

      expect(authAvailable()).toBe(false)
    },
  )
})
