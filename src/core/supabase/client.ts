import { createClient } from '@supabase/supabase-js'

import { AUTH_STORAGE_KEY } from './auth-storage'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Même condition qu'`authAvailable()`, qui masque le parcours compte avant d'en arriver là.
if (!url || !publishableKey) {
  throw new Error(
    'Configuration Supabase manquante : copie `.env.example` vers `.env` et renseigne ' +
      'VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY.',
  )
}

export default createClient(url, publishableKey, {
  auth: { storageKey: AUTH_STORAGE_KEY },
})
