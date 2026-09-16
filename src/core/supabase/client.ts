import { createClient } from '@supabase/supabase-js'

import { authAvailable } from '@/shared/auth-available'

import { AUTH_STORAGE_KEY } from './auth-storage'

if (!authAvailable()) {
  throw new Error(
    'Configuration Supabase manquante : copie `.env.example` vers `.env` et renseigne ' +
      'VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY.',
  )
}

export default createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { storageKey: AUTH_STORAGE_KEY } },
)
