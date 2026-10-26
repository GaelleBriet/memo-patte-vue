import { ErasureNotConfiguredError } from '../_shared/account-erasure.ts'
import { isSharedSecret, longEnoughSecret } from '../_shared/shared-secret.ts'
import { runPurgePass, type PurgeMode, type PurgePassPorts } from './purge-pass.ts'

export const CRON_SECRET_HEADER = 'x-memopatte-cron-secret'

const APPLY = 'apply'

export type InactiveAccountsSettings = { cronSecret: string | undefined; mode: PurgeMode }

/** Seul le réglage du serveur fait passer en « appliquer » ; la demande du cron n'a aucun mot à dire. */
export function inactiveAccountsSettingsFrom(
  env: (name: string) => string | undefined,
): InactiveAccountsSettings {
  return {
    cronSecret: longEnoughSecret(
      env('INACTIVE_ACCOUNTS_CRON_SECRET'),
      'INACTIVE_ACCOUNTS_CRON_SECRET',
      'Purge désactivée',
    ),
    mode: env('INACTIVE_ACCOUNTS_MODE') === APPLY ? 'apply' : 'dry-run',
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleInactiveAccounts(
  request: Request,
  settings: InactiveAccountsSettings,
  ports: PurgePassPorts,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' })
  if (!settings.cronSecret) {
    console.error('Purge refusée : INACTIVE_ACCOUNTS_CRON_SECRET n’est pas réglé')
    return json(503, { error: 'purge-not-configured' })
  }
  const secret = request.headers.get(CRON_SECRET_HEADER) ?? ''
  if (!(await isSharedSecret(secret, settings.cronSecret))) {
    return json(401, { error: 'unauthorized' })
  }

  try {
    const report = await runPurgePass(ports, settings.mode)
    console.warn('Purge des comptes inactifs :', JSON.stringify(report))
    return json(200, report)
  } catch (cause) {
    if (cause instanceof ErasureNotConfiguredError) {
      console.error('Purge refusée :', cause.message)
      return json(503, { error: 'erasure-not-configured' })
    }
    console.error('Purge des comptes inactifs en échec : comptes illisibles')
    return json(500, { error: 'purge-failed' })
  }
}
