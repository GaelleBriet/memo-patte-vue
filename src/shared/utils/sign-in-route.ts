import type { LocationQuery, RouteLocationRaw } from 'vue-router'

import type { RestoreFlowState } from '@/core/sync/service/restore-flow'
import { restoreRoute } from './restore-route'

const SIGN_IN_ROUTE = 'sign-in'
const PASSWORD_RESET_ROUTE = 'password-reset'
const PASSWORD_CHANGE_ORIGIN = 'settings-account'
const PASSWORD_CHANGE_ROUTE = 'settings-account-password'
const ACCOUNT_FIRST_ROUTE = 'plus-account'
const DEFAULT_RETURN_ROUTE = 'plus'
const RETURN_ROUTES: readonly string[] = [
  'plus',
  ACCOUNT_FIRST_ROUTE,
  'settings',
  'settings-plus',
  'settings-account',
  'settings-backup',
  'home',
]
const HELP_RETURN_ROUTES: readonly string[] = ['settings-backup', 'settings-account-email']
const HELP_ROUTE = 'settings-help'
const HELP_DEFAULT_RETURN_ROUTE = 'settings'
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
export function passwordResetRoute(
  query: LocationQuery,
  email: string,
  { emailLocked = false } = {},
): RouteLocationRaw {
  return {
    name: PASSWORD_RESET_ROUTE,
    query: journeyQuery(query),
    state: { email, ...(emailLocked ? { emailLocked } : {}) },
  }
}

/** La flèche de « Mot de passe oublié » : l'écran qui l'a ouvert. */
export function passwordResetBackRoute(query: LocationQuery): RouteLocationRaw {
  if (query.from === PASSWORD_CHANGE_ORIGIN) return { name: PASSWORD_CHANGE_ROUTE }
  return signInRouteFrom(query)
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

function knownReturnRoute(
  from: unknown,
  allowed: readonly string[],
  fallback: string,
): RouteLocationRaw {
  return { name: typeof from === 'string' && allowed.includes(from) ? from : fallback }
}

export function signInReturnRoute(from: unknown): RouteLocationRaw {
  return knownReturnRoute(from, RETURN_ROUTES, DEFAULT_RETURN_ROUTE)
}

export function helpRoute(from: string): RouteLocationRaw {
  return { name: HELP_ROUTE, query: { from } }
}

export function isHelpRoute(name: unknown): boolean {
  return name === HELP_ROUTE
}

/** La flèche d'Aide et contact : l'écran qui l'a ouverte s'il est connu, sinon les Paramètres. */
export function helpBackRoute(from: unknown): RouteLocationRaw {
  return knownReturnRoute(from, HELP_RETURN_ROUTES, HELP_DEFAULT_RETURN_ROUTE)
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
