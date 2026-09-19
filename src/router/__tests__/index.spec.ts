import { beforeEach, describe, expect, it, vi } from 'vitest'

import { routeurMemoire } from './routeur-memoire'
import { routes } from '@/router'

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

  it('ne déclare écrans racine que l’accueil et le carnet', () => {
    const racines = routes.filter((route) => route.meta?.rootScreen).map((route) => route.name)

    expect(racines).toEqual(['home', 'animals'])
  })
})
