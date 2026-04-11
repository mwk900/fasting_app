import { createClient } from '@supabase/supabase-js'

function getRequiredEnvVar(key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY') {
  const value = import.meta.env[key]

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }

  return value
}

export const supabase = createClient(
  getRequiredEnvVar('VITE_SUPABASE_URL'),
  getRequiredEnvVar('VITE_SUPABASE_ANON_KEY'),
)
