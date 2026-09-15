import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'

import { routes } from '@/router'

// Composants bouchonnés : la table des routes se teste sans charger les écrans réels ni SQLite.
const Vide = { render: () => null }

function sansEcran(route: RouteRecordRaw): RouteRecordRaw {
  if (!('component' in route)) return route

  return { path: route.path, name: route.name, props: route.props, component: Vide }
}

function routeurMemoire() {
  return createRouter({ history: createMemoryHistory(), routes: routes.map(sansEcran) })
}

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
})
