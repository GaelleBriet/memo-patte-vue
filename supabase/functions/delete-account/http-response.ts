import { ErasureNotConfiguredError, errorMessage } from '../_shared/account-erasure.ts'

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export function deletionFailed(cause: unknown): Response {
  if (cause instanceof ErasureNotConfiguredError) {
    console.error('Suppression de compte refusée :', cause.message)
    return json(503, { error: 'erasure-not-configured' })
  }
  console.error('Suppression de compte en échec :', errorMessage(cause))
  return json(500, { error: 'deletion-failed' })
}
