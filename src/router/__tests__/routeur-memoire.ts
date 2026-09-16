import { createMemoryHistory, createRouter, type Router, type RouteRecordRaw } from 'vue-router'

import { routes } from '@/router'

// Écrans bouchonnés : la table des routes et la coquille se testent sans charger
// les vues réelles ni SQLite.
const Vide = { render: () => null }

function sansEcran(route: RouteRecordRaw): RouteRecordRaw {
  if (!('component' in route)) return route

  return {
    path: route.path,
    name: route.name,
    props: route.props,
    meta: route.meta,
    component: Vide,
  }
}

export function routeurMemoire(): Router {
  return createRouter({ history: createMemoryHistory(), routes: routes.map(sansEcran) })
}
