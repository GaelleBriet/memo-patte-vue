import type { SupabaseClient } from '@supabase/supabase-js'

/** Import dynamique : `client.ts` lève sans configuration, chargée seulement au premier besoin réel. */
export async function loadSupabaseClient(): Promise<SupabaseClient> {
  return (await import('./client')).default
}
