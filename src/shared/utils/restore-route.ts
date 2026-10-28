import type { RouteLocationRaw } from 'vue-router'

export const RESTORE_ROUTE = 'account-restore'
const DEFAULT_RETURN_ROUTE = 'home'
const RETURN_ROUTES: readonly string[] = ['home', 'settings-plus', 'settings-backup']

/** `from` : l'écran d'où part la restauration, où le retour ramène. */
export function restoreRoute(from: string): RouteLocationRaw {
  return { name: RESTORE_ROUTE, query: { from } }
}

export function restoreReturnRoute(from: unknown): { name: string } {
  return {
    name: typeof from === 'string' && RETURN_ROUTES.includes(from) ? from : DEFAULT_RETURN_ROUTE,
  }
}
