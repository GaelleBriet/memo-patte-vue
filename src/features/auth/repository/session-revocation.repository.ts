import type { SupabaseClient } from '@supabase/supabase-js'

import { forgetStoredSession, onSessionUnreadable } from '@/core/supabase/auth-storage'
import { errorSummary } from '@/shared/utils/error-summary'

/** Hors ligne, Supabase retente le rafraîchissement pendant 30 s avant d'abandonner. */
export const SIGN_OUT_TIMEOUT_MS = 3_000

type Revocation = { ok: true } | { ok: false; trace: string }

const REVOKED: Revocation = { ok: true }

function failedRevocation(cause: unknown): Revocation {
  return { ok: false, trace: errorSummary(cause) }
}

/** Un seul délai pour les deux tentatives de `signOut` : la seconde n'ajoute jamais d'attente. */
function revocationTimeout(): { reached: Promise<Revocation>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const reached = new Promise<Revocation>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, trace: 'délai dépassé' }), SIGN_OUT_TIMEOUT_MS)
  })
  return { reached, clear: () => clearTimeout(timer) }
}

export function createSessionRevocation(client: () => Promise<SupabaseClient>) {
  function revoke(scope: 'global' | 'local'): Promise<Revocation> {
    return client()
      .then((supabase) => supabase.auth.signOut({ scope }))
      .then(
        ({ error }) => (error ? failedRevocation(error) : REVOKED),
        (cause: unknown) => failedRevocation(cause),
      )
  }

  return {
    forgetSession: forgetStoredSession,
    onSessionUnreadable,

    async signOut(): Promise<void> {
      const timeout = revocationTimeout()
      const outcome = await Promise.race([revoke('global'), timeout.reached])
      if (!outcome.ok) {
        console.warn('Session non invalidée auprès de Supabase :', outcome.trace)
        await Promise.race([revoke('local'), timeout.reached])
        await forgetStoredSession()
      }
      timeout.clear()
    },

    async discardSession(): Promise<void> {
      const timeout = revocationTimeout()
      const outcome = await Promise.race([revoke('local'), timeout.reached])
      if (!outcome.ok) await forgetStoredSession()
      timeout.clear()
    },
  }
}
