import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

export default defineNuxtPlugin<{ supabase: SupabaseClient | null }>(() => {
  const config = useRuntimeConfig()

  const supabaseUrl = config.public.supabaseUrl
  const supabaseKey = config.public.supabasePublishableKey

  if (!supabaseUrl || !supabaseKey) {
    return {
      provide: {
        supabase: null
      }
    }
  }

  const supabase = createBrowserClient(supabaseUrl, supabaseKey) as SupabaseClient

  return {
    provide: {
      supabase
    }
  }
})
