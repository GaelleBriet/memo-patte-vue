import { describe, expect, it } from 'vitest'

import { RESTORE_ROUTE, restoreReturnRoute, restoreRoute } from '../utils/restore-route'
import { routes } from '@/router'

describe('restoreRoute', () => {
  it('emporte l’écran d’origine dans l’adresse', () => {
    expect(restoreRoute('settings-plus')).toEqual({
      name: 'account-restore',
      query: { from: 'settings-plus' },
    })
  })

  it('désigne une route déclarée, poussée hors de la barre du bas', () => {
    const route = routes.find(({ name }) => name === RESTORE_ROUTE)
    expect(route).toBeDefined()
    expect(route?.meta?.rootScreen).toBeUndefined()
  })
})

describe('restoreReturnRoute', () => {
  it('ramène à l’écran d’origine', () => {
    expect(restoreReturnRoute('home')).toEqual({ name: 'home' })
    expect(restoreReturnRoute('settings-plus')).toEqual({ name: 'settings-plus' })
    expect(restoreReturnRoute('settings-backup')).toEqual({ name: 'settings-backup' })
  })

  it('se replie sur l’accueil quand l’origine est absente ou inconnue', () => {
    expect(restoreReturnRoute(undefined)).toEqual({ name: 'home' })
    expect(restoreReturnRoute('carnet')).toEqual({ name: 'home' })
  })
})
