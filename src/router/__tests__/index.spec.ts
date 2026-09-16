import { describe, expect, it } from 'vitest'

import { routeurMemoire } from './routeur-memoire'
import { routes } from '@/router'

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

  it('ne déclare écrans racine que l’accueil et le carnet', () => {
    const racines = routes.filter((route) => route.meta?.rootScreen).map((route) => route.name)

    expect(racines).toEqual(['home', 'animals'])
  })
})
