// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { nextAfterRestore } from '../logic/purchase-restore'

const ANNUEL = { plan: 'annual', expiresAt: '2027-10-22T10:00:00Z' } as const

describe('nextAfterRestore', () => {
  it('sans compte ou session refusée, passe par la connexion, qui ramène à l’écran d’origine', () => {
    const connexion = {
      kind: 'detour',
      route: { name: 'sign-in', query: { from: 'settings-plus' } },
    }

    expect(nextAfterRestore({ kind: 'needs-account' }, 'settings-plus')).toEqual(connexion)
    expect(nextAfterRestore({ kind: 'needs-sign-in' }, 'settings-plus')).toEqual(connexion)
    expect(nextAfterRestore({ kind: 'needs-account' }, 'plus')).toEqual({
      kind: 'detour',
      route: { name: 'sign-in', query: { from: 'plus' } },
    })
  })

  it('hors ligne, reste sur l’écran pour le dire', () => {
    expect(nextAfterRestore({ kind: 'offline' }, 'plus')).toEqual({ kind: 'offline' })
  })

  it('rend le statut restauré', () => {
    expect(nextAfterRestore({ kind: 'restored', status: ANNUEL }, 'plus')).toEqual({
      kind: 'restored',
      status: ANNUEL,
    })
  })
})
