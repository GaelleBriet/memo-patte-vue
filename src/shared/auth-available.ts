/** Symétrique de `billingService.isAvailable()` : sans configuration, pas de parcours compte. */
export function authAvailable(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
}
