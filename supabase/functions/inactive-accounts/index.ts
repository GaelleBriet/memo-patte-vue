import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'

import { providerErasuresFrom, revenuecatKeyFrom } from '../_shared/provider-settings.ts'
import { revenuecatCustomerErasure } from '../_shared/revenuecat-erasure.ts'
import { revenuecatSubscriberReader } from '../_shared/revenuecat-subscriber.ts'
import { serverSecretKeyFrom, withServerSecretKey } from '../_shared/server-secret-key.ts'
import { supabaseErasurePorts } from '../_shared/supabase-account-erasure.ts'
import { candidateFrom, noticeRowOf, type CandidateRow } from './candidate-row.ts'
import { NO_EMAIL_CHANNEL } from './email-channel.ts'
import { handleInactiveAccounts, inactiveAccountsSettingsFrom } from './inactive-accounts.ts'
import type { PurgePassPorts } from './purge-pass.ts'

const env = (name: string) => Deno.env.get(name)
const settings = inactiveAccountsSettingsFrom(env)
const revenuecatKey = revenuecatKeyFrom(env)

function servePurge(admin: SupabaseClient) {
  async function candidates(at: string, onlyAccount?: string) {
    const { data, error } = await admin.rpc(
      'inactive_account_steps',
      onlyAccount ? { at, only_account: onlyAccount } : { at },
    )
    if (error) throw error
    return (data as CandidateRow[]).map(candidateFrom)
  }

  const ports: PurgePassPorts = {
    listCandidates: (at) => candidates(at),
    async readCandidate(userId, at) {
      return (await candidates(at, userId))[0] ?? null
    },
    revenuecat: revenuecatKey
      ? {
          read: revenuecatSubscriberReader(revenuecatKey, fetch),
          erase: revenuecatCustomerErasure(revenuecatKey, fetch),
        }
      : null,
    channel: NO_EMAIL_CHANNEL,
    async saveNotice(userId, notice) {
      const { error } = await admin
        .from('account_purge_notice')
        .upsert(noticeRowOf(userId, notice), { onConflict: 'user_id' })
      if (error) throw error
    },
    erasure: { ...providerErasuresFrom(env, fetch), ...supabaseErasurePorts(admin) },
  }
  return (request: Request) => handleInactiveAccounts(request, settings, ports)
}

Deno.serve(
  withServerSecretKey('Purge des comptes inactifs', serverSecretKeyFrom(env), (key) =>
    servePurge(
      createClient(env('SUPABASE_URL') ?? '', key, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    ),
  ),
)
