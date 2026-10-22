import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routeurMemoire } from './routeur-memoire'
import { routes } from '@/router'
import { memoryStorage, USER_ID } from '@/features/auth/__tests__/auth-fixture'
import { writePlusAccount } from '@/features/auth/logic/plus-account-storage'
import { authRepository } from '@/features/auth/repository/auth.repository'
import {
  provideAuthRepository,
  useAuthStore,
  type SessionState,
} from '@/features/auth/store/auth.store'

const authAvailable = vi.hoisted(() => vi.fn<() => boolean>(() => true))

vi.mock('@/shared/utils/auth-available', () => ({ authAvailable }))

beforeEach(() => {
  authAvailable.mockReturnValue(true)
})

describe('routeur', () => {
  it('ramène à l’accueil une adresse qui ne correspond à aucun écran', async () => {
    const routeur = routeurMemoire()

    await routeur.push('/animals/11111111-1111-4111-8111-111111111111/documents')

    expect(routeur.currentRoute.value.name).toBe('home')
    expect(routeur.currentRoute.value.path).toBe('/')
  })

  it('fait passer le repli par les gardes, qui gardent le dernier mot', async () => {
    const routeur = routeurMemoire()
    await routeur.replace('/settings')
    const vues: (string | symbol | undefined)[] = []
    routeur.beforeEach((to) => {
      vues.push(to.name)
      return false
    })

    await routeur.push('/oups')

    expect(vues).toEqual(['home'])
    expect(routeur.currentRoute.value.name).toBe('settings')
  })

  it('ouvre la connexion quand Supabase est configuré', async () => {
    const routeur = routeurMemoire()

    await routeur.push('/sign-in')

    expect(routeur.currentRoute.value.name).toBe('sign-in')
  })

  it('renvoie vers MémoPatte Plus quand Supabase n’est pas configuré', async () => {
    authAvailable.mockReturnValue(false)
    const routeur = routeurMemoire()

    await routeur.push('/sign-in')

    expect(routeur.currentRoute.value.name).toBe('plus')
  })

  it('n’ouvre « Étape 1 sur 2 » que si Supabase est configuré', async () => {
    const routeur = routeurMemoire()
    await routeur.push('/plus/account')
    expect(routeur.currentRoute.value.name).toBe('plus-account')

    authAvailable.mockReturnValue(false)
    const sansCompte = routeurMemoire()
    await sansCompte.push('/plus/account')
    expect(sansCompte.currentRoute.value.name).toBe('plus')
  })

  it('ne déclare écrans racine que l’accueil et le carnet', () => {
    const racines = routes.filter((route) => route.meta?.rootScreen).map((route) => route.name)

    expect(racines).toEqual(['home', 'carnet'])
  })
})

describe('garde des écrans Plus', () => {
  const PLUS_SCREENS = ['account-restore', 'settings-account', 'settings-account-delete']
  const SESSION_STATES: SessionState[] = [
    'none',
    'restoring',
    'active',
    'needs-refresh',
    'needs-sign-in',
  ]

  function withDevice(hasAccount: boolean, sessionState: SessionState = 'none') {
    vi.stubGlobal('localStorage', memoryStorage())
    if (hasAccount) writePlusAccount({ userId: USER_ID })
    setActivePinia(createPinia())
    useAuthStore().sessionState = sessionState
  }

  beforeEach(() => {
    provideAuthRepository(() => authRepository)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(PLUS_SCREENS)(
    '%s renvoie vers MémoPatte Plus quand l’appareil n’a aucun compte',
    async (name) => {
      withDevice(false)
      const routeur = routeurMemoire()

      await routeur.push({ name })

      expect(routeur.currentRoute.value.name).toBe('plus')
    },
  )

  it.each(PLUS_SCREENS.flatMap((name) => SESSION_STATES.map((state) => [name, state] as const)))(
    '%s reste ouvert avec un compte sur l’appareil, session %s',
    async (name, state) => {
      withDevice(true, state)
      const routeur = routeurMemoire()

      await routeur.push({ name })

      expect(routeur.currentRoute.value.name).toBe(name)
    },
  )

  it('garde la requête de « Restaurer mon carnet » avec un compte', async () => {
    withDevice(true)
    const routeur = routeurMemoire()

    await routeur.push({ name: 'account-restore', query: { from: 'home' } })

    expect(routeur.currentRoute.value.query).toEqual({ from: 'home' })
  })

  it('ne protège aucun écran du parcours gratuit', async () => {
    withDevice(false)
    const gratuits = routes.filter(
      (route) =>
        typeof route.name === 'string' &&
        !PLUS_SCREENS.includes(route.name) &&
        !['plus', 'sign-in', 'plus-account'].includes(route.name) &&
        !route.path.includes(':'),
    )

    for (const route of gratuits) {
      const routeur = routeurMemoire()
      await routeur.push({ name: route.name })
      expect(`${String(route.name)} → ${String(routeur.currentRoute.value.name)}`).toBe(
        `${String(route.name)} → ${String(route.name)}`,
      )
    }
    expect(gratuits.length).toBeGreaterThan(10)
  })
})
