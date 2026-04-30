import type { H3Event } from 'h3'
import { createClient } from '@supabase/supabase-js'
import { createServerError } from './errors'

export function createServiceSupabaseClient(event?: H3Event) {
  const config = getOptionalRuntimeConfig(event)
  const supabaseUrl = config?.public?.supabaseUrl || process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = config?.supabaseServiceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw createServerError(500, 'Supabase service role is not configured')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

function getOptionalRuntimeConfig(event?: H3Event) {
  if (event) {
    return useRuntimeConfig(event)
  }

  return typeof useRuntimeConfig === 'function' ? useRuntimeConfig() : null
}
