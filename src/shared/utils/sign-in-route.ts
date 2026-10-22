import type { LocationQuery, RouteLocationRaw } from 'vue-router'

import type { RestoreFlowState } from '@/core/sync/service/restore-flow'
import { restoreRoute } from './restore-route'

const SIGN_IN_ROUTE = 'sign-in'
const PASSWORD_RESET_ROUTE = 'password-reset'
const ACCOUNT_FIRST_ROUTE = 'plus-account'
const DEFAULT_RETURN_ROUTE = 'plus'
const RETURN_ROUTES: readonly string[] = [
  'plus',
  ACCOUNT_FIRST_ROUTE,
  'settings',
  'settings-plus',
  'home',
]
const RESTORE_FLAG = '1'
const SIGN_UP_MODE = 'sign-up'

/**
 * `from` : le parcours qui ouvre l'écran, où la connexion réussie ramènera ; `restore` : la
 * connexion mène à « Restaurer mon carnet » quand le compte a une sauvegarde ; `signUp` : l'écran
 * s'ouvre sur la création du compte.
 */
export function signInRoute(
  from: string,
  { restore = false, signUp = false } = {},
): RouteLocationRaw {
  return {
    name: SIGN_IN_ROUTE,
    query: {
      from,
      ...(restore ? { restore: RESTORE_FLAG } : {}),
      ...(signUp ? { mode: SIGN_UP_MODE } : {}),
    },
  }
}

function journeyQuery(query: LocationQuery): Record<string, string> {
  return {
    ...(typeof query.from === 'string' ? { from: query.from } : {}),
    ...(query.restore === RESTORE_FLAG ? { restore: RESTORE_FLAG } : {}),
  }
}

/** L'adresse passe par l'état de l'historique : l'adresse de l'écran part dans les statistiques. */
export function passwordResetRoute(query: LocationQuery, email: string): RouteLocationRaw {
  return { name: PASSWORD_RESET_ROUTE, query: journeyQuery(query), state: { email } }
}

/** La connexion, avec le parcours d'origine et la restauration de l'écran qui la quitte. */
export function signInRouteFrom(query: LocationQuery): RouteLocationRaw {
  return { name: SIGN_IN_ROUTE, query: journeyQuery(query) }
}

/** « Étape 1 sur 2 » : le compte avant le paiement de l'offre choisie. */
export function accountFirstRoute(): RouteLocationRaw {
  return { name: ACCOUNT_FIRST_ROUTE }
}

export function asksSignUp(query: LocationQuery): boolean {
  return query.mode === SIGN_UP_MODE
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
