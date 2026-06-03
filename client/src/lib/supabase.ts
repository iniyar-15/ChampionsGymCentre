import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const isConfigured =
  supabaseUrl && supabaseUrl !== 'https://placeholder.supabase.co' &&
  supabaseAnonKey && supabaseAnonKey !== 'placeholder-anon-key'

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
)