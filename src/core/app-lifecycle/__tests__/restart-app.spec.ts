import { afterEach, describe, expect, it, vi } from 'vitest'

import { restartApp } from '../restart-app'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('restartApp', () => {
  it('recharge l’app à sa racine, sans garder l’écran courant dans l’historique', () => {
    const replace = vi.fn<(url: string) => void>()
    vi.stubGlobal('location', { replace })

    restartApp()

    expect(replace).toHaveBeenCalledExactlyOnceWith(import.meta.env.BASE_URL)
  })
})
