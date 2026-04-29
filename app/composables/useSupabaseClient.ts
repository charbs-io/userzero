import type { SupabaseClient } from '@supabase/supabase-js'

export function useSupabaseClient() {
  const supabase = useNuxtApp().$supabase as SupabaseClient | null

  if (!supabase) {
    throw new Error('Supabase is not configured. Set NUXT_PUBLIC_SUPABASE_URL and NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.')
  }

  return supabase
}
