import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

import { syncPlusEntitlements } from './plus-entitlement-sync.ts'
import { revenuecatSubscriberReader } from '../_shared/revenuecat-subscriber.ts'
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
        async savePlusAccess(userId, access, readAt) {
          const row = {
            active: access.active,
            product_type: access.productType,
            expires_at: access.expiresAt,
            updated_at: readAt,
          }
          const { data: updated, error } = await admin
            .from('plus_entitlements')
            .update(row)
            .eq('user_id', userId)
            .lt('updated_at', readAt)
            .select('user_id')
          if (error) throw error
          if (updated.length > 0) return
          const { error: insertError } = await admin
            .from('plus_entitlements')
            .upsert({ user_id: userId, ...row }, { onConflict: 'user_id', ignoreDuplicates: true })
          if (insertError) throw insertError
        },
        async endPlusAccess(userId, readAt) {
          const { error } = await admin
            .from('plus_entitlements')
            .update({ active: false, expires_at: readAt, updated_at: readAt })
            .eq('user_id', userId)
            .lt('updated_at', readAt)
            .or(`expires_at.is.null,expires_at.gt.${readAt}`)
          if (error) throw error
        },
      }),
  }),
)
