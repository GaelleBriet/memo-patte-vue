import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'

import { adminSecretFrom } from './admin-secret-setting.ts'
import { handleDeleteAccount } from './delete-account.ts'
import { CORS_HEADERS } from './http-response.ts'
import { providerErasuresFrom } from '../_shared/provider-settings.ts'
import { serverSecretKeyFrom, withServerSecretKey } from '../_shared/server-secret-key.ts'
import { supabaseErasurePorts } from '../_shared/supabase-account-erasure.ts'

const adminSecret = adminSecretFrom(Deno.env.get('ADMIN_DELETE_SECRET'))
const env = (name: string) => Deno.env.get(name)

function serveDeletion(admin: SupabaseClient) {
  return (request: Request) =>
    handleDeleteAccount(request, {
      adminSecret,
      ...providerErasuresFrom(env, fetch),
      ...supabaseErasurePorts(admin),
      async userIdFromToken(token) {
        const { data, error } = await admin.auth.getUser(token)
        if (data.user) return data.user.id
        if (error?.status === 401 || error?.status === 403) return null
        throw error
      },
      async userIdByEmail(email) {
        const { data, error } = await admin.rpc('account_id_by_email', { account_email: email })
        if (error) throw error
        return typeof data === 'string' ? data : null
      },
      async deleteCloudBackup(userId) {
        const { error } = await admin.rpc('delete_cloud_backup', { account: userId })
        if (error) throw error
      },
    })
}

Deno.serve(
  withServerSecretKey(
    'Suppression de compte',
    serverSecretKeyFrom(env),
    (key) =>
      serveDeletion(
        createClient(env('SUPABASE_URL') ?? '', key, {
          auth: { persistSession: false, autoRefreshToken: false },
        }),
      ),
    CORS_HEADERS,
  ),
)
