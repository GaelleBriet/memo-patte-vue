import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

import { handleDeleteAccount } from './delete-account.ts'

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)
const photos = admin.storage.from('animal-photos')

Deno.serve((request) =>
  handleDeleteAccount(request, {
    async userIdFromToken(token) {
      const { data, error } = await admin.auth.getUser(token)
      if (data.user) return data.user.id
      if (error?.status === 401 || error?.status === 403) return null
      throw error
    },
    async listPhotos(folder, limit) {
      const { data, error } = await photos.list(folder, { limit })
      if (error) throw error
      return data.map((object) => object.name)
    },
    async removePhotos(paths) {
      const { error } = await photos.remove(paths)
      if (error) throw error
    },
    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId, false)
      if (error) throw error
    },
  }),
)
