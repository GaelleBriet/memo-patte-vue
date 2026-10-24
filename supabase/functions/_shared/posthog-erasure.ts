import { sendTo } from './provider-request.ts'
import type { ProviderErasure } from './account-erasure.ts'

export type PostHogSettings = { host: string; projectId: string; personalApiKey: string }

async function deletionErrorsOf(response: Response): Promise<unknown[]> {
  const summary: unknown = await response.json().catch(() => null)
  const errors = (summary as { deletion_errors?: unknown } | null)?.deletion_errors
  if (!Array.isArray(errors)) throw new Error('PostHog : réponse illisible')
  return errors
}

/** Personne absente (statistiques jamais acceptées) : PostHog n'en trouve aucune, c'est un succès. */
export function posthogPersonErasure(
  settings: PostHogSettings,
  send: typeof fetch,
): ProviderErasure {
  const url = `${settings.host.replace(/\/+$/, '')}/api/projects/${settings.projectId}/persons/bulk_delete/`
  return async (userId) => {
    const response = await sendTo('PostHog', send, url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.personalApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ distinct_ids: [userId], delete_events: true }),
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`PostHog a répondu ${response.status}`)
    }
    const errors = await deletionErrorsOf(response)
    if (errors.length > 0) throw new Error(`PostHog : ${errors.length} personne(s) non effacée(s)`)
  }
}
