import type { RouteLocationRaw } from 'vue-router'

const SIGN_IN_ROUTE = 'sign-in'
const DEFAULT_RETURN_ROUTE = 'plus'
const RETURN_ROUTES: readonly string[] = ['plus', 'settings']

/** `from` : le parcours qui ouvre l'écran, où la connexion réussie ramènera. */
export function signInRoute(from: string): RouteLocationRaw {
  return { name: SIGN_IN_ROUTE, query: { from } }
}

export function signInReturnRoute(from: unknown): RouteLocationRaw {
  return {
    name: typeof from === 'string' && RETURN_ROUTES.includes(from) ? from : DEFAULT_RETURN_ROUTE,
  }
}
