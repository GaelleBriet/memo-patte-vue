import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error(
    'Configuration Supabase manquante : copie `.env.example` vers `.env` et renseigne ' +
      'VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY.',
  )
}

export default createClient(url, publishableKey)
