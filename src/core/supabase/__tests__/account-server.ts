import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { vi } from 'vitest'

import { createBoundedFetch } from '../request-timeout'
import { requireUserSession } from '../user-session-required'

export const PROJECT = 'https://projet.supabase.co'
export const PUBLISHABLE_KEY = 'sb_publishable_test'
export const USER_ID = '5d0f6c1e-7a2b-4c39-9e51-0b8d2f4a6c13'
export const NOW = new Date('2026-11-03T08:00:00.000Z')

const USER_TOKEN = 'jeton-utilisateur'
const STORAGE_KEY = 'memopatte.test.session'

/** Muet : sans réponse ; coupé : réseau perdu ; refusé : jeton de rafraîchissement inconnu ; renouvelé : nouveau jeton. */
export type AuthAnswer = 'muet' | 'coupé' | 'refusé' | 'renouvelé'

/**
 * Serveur d'un compte qui a deux animaux sauvegardés : la RLS les cache à une requête qui n'a pas
 * le jeton de l'utilisateur. Seul `/auth/v1/token` répond selon `auth`.
 */
export function accountServer(auth: AuthAnswer) {
  const dataRequests: string[] = []
  const serverFetch = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.pathname === '/auth/v1/token') {
      if (auth === 'muet') return new Promise<Response>(() => {})
      if (auth === 'coupé') throw new TypeError('Failed to fetch')
      if (auth === 'renouvelé') return Response.json(sessionWith(USER_TOKEN, 3600))
      return Response.json(
        {
          code: 'refresh_token_not_found',
          message: 'Invalid Refresh Token: Refresh Token Not Found',
        },
        { status: 400 },
      )
    }
    const authorization = new Headers(init?.headers).get('Authorization')
    dataRequests.push(`${url.pathname} ${authorization}`)
    const owner = authorization === `Bearer ${USER_TOKEN}`
    if (url.pathname.startsWith('/storage/v1/')) {
      return Response.json(owner ? [{ name: 'milo.webp', id: 'objet-1' }] : [])
    }
    const rows = owner ? [{ id: 'milo', server_updated_at: '2026-10-20T19:04:00+00:00' }] : []
    return new Response(JSON.stringify(rows), {
      headers: { 'content-range': owner ? '0-1/2' : '*/0', 'content-type': 'application/json' },
    })
  })
  return { serverFetch, dataRequests }
}

/** Session enregistrée sur le téléphone, jeton encore valide ou déjà périmé. */
export function clientOver(serverFetch: typeof fetch, token: 'valide' | 'périmé'): SupabaseClient {
  const session =
    token === 'valide' ? sessionWith(USER_TOKEN, 3600) : sessionWith('jeton-perime', -60)
  const stored = new Map([[STORAGE_KEY, JSON.stringify(session)]])
  return createClient(PROJECT, PUBLISHABLE_KEY, {
    auth: {
      storageKey: STORAGE_KEY,
      storage: {
        getItem: (key) => stored.get(key) ?? null,
        setItem: (key, value) => void stored.set(key, value),
        removeItem: (key) => void stored.delete(key),
      },
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: requireUserSession(createBoundedFetch(serverFetch)) },
  })
}

function sessionWith(accessToken: string, expiresInSeconds: number) {
  return {
    access_token: accessToken,
    refresh_token: 'jeton-de-rafraichissement',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(NOW.getTime() / 1000) + expiresInSeconds,
    user: {
      id: USER_ID,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '',
    },
  }
}
