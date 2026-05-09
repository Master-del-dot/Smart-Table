import { createClient } from '@supabase/supabase-js'
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from './constants'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

export const supabaseProject = {
  url: supabaseUrl,
  isConfigured: Boolean(supabaseUrl && supabaseAnonKey),
}
