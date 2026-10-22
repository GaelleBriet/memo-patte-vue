import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

import { syncPlusEntitlements } from './plus-entitlement-sync.ts'
import { revenuecatSubscriberReader } from './revenuecat-subscriber.ts'
import { handleRevenuecatWebhook } from './webhook-request.ts'

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)
const fetchSubscriber = revenuecatSubscriberReader(
  Deno.env.get('REVENUECAT_SECRET_KEY')?.trim(),
  fetch,
)

Deno.serve((request) =>
  handleRevenuecatWebhook(request, {
    expectedAuthorization: Deno.env.get('REVENUECAT_WEBHOOK_AUTHORIZATION'),
    processEvent: (event) =>
      syncPlusEntitlements(event, {
        now: Date.now,
        async accountExists(userId) {
          const { data, error } = await admin.auth.admin.getUserById(userId)
          if (data.user) return true
          if (error?.status === 404) return false
          throw error
        },
        fetchSubscriber,
        async savePlusAccess(userId, access) {
          const { error } = await admin.from('plus_entitlements').upsert({
            user_id: userId,
            active: access.active,
            product_type: access.productType,
            expires_at: access.expiresAt,
            updated_at: new Date().toISOString(),
          })
          if (error) throw error
        },
        async endPlusAccess(userId, at) {
          const { error } = await admin
            .from('plus_entitlements')
            .update({ active: false, expires_at: at, updated_at: at })
            .eq('user_id', userId)
            .or(`expires_at.is.null,expires_at.gt.${at}`)
          if (error) throw error
        },
      }),
  }),
)
