import type { LocationQuery, RouteLocationRaw } from 'vue-router'

import type { RestoreFlowState } from '@/core/sync/service/restore-flow'
import { restoreRoute } from './restore-route'

const SIGN_IN_ROUTE = 'sign-in'
const DEFAULT_RETURN_ROUTE = 'plus'
const RETURN_ROUTES: readonly string[] = ['plus', 'settings', 'settings-plus', 'home']
const RESTORE_FLAG = '1'

/**
 * `from` : le parcours qui ouvre l'écran, où la connexion réussie ramènera ; `restore` : la
 * connexion mène à « Restaurer mon carnet » quand le compte a une sauvegarde.
 */
export function signInRoute(from: string, { restore = false } = {}): RouteLocationRaw {
  return { name: SIGN_IN_ROUTE, query: restore ? { from, restore: RESTORE_FLAG } : { from } }
}

export function signInReturnRoute(from: unknown): RouteLocationRaw {
  return {
    name: typeof from === 'string' && RETURN_ROUTES.includes(from) ? from : DEFAULT_RETURN_ROUTE,
  }
}

export function asksRestore(query: LocationQuery): boolean {
  return query.restore === RESTORE_FLAG
}

/**
 * Où va une connexion réussie, une fois la sauvegarde du compte contrôlée ; `null` : la connexion
 * reste à l'écran, le serveur n'a pas répondu à temps.
 */
export function afterSignInRoute(
  query: LocationQuery,
  restore: RestoreFlowState,
): RouteLocationRaw | null {
  const back = signInReturnRoute(query.from)
  if (asksRestore(query) && restore.step === 'no-answer') return null
  if (!asksRestore(query) || restore.step === 'idle' || restore.step === 'checking') return back
  return restoreRoute(typeof query.from === 'string' ? query.from : 'home')
}
