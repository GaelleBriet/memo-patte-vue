import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

import { adminSecretFrom } from './admin-secret-setting.ts'
import { handleDeleteAccount } from './delete-account.ts'
import { providerErasuresFrom } from '../_shared/provider-settings.ts'
import { supabaseErasurePorts } from '../_shared/supabase-account-erasure.ts'

const adminSecret = adminSecretFrom(Deno.env.get('ADMIN_DELETE_SECRET'))
const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)

Deno.serve((request) =>
  handleDeleteAccount(request, {
    adminSecret,
    ...providerErasuresFrom((name) => Deno.env.get(name), fetch),
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
  }),
)
