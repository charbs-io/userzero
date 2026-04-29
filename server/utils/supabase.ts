import type { H3Event } from 'h3'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { createError, getCookie, getHeader, parseCookies, setCookie } from 'h3'

export function createEventSupabaseClient(event: H3Event) {
  const config = useRuntimeConfig(event)

  if (!config.public.supabaseUrl || !config.public.supabasePublishableKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Supabase is not configured'
    })
  }

  return createServerClient(
    config.public.supabaseUrl,
    config.public.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          const cookies = parseCookies(event)
          return Object.entries(cookies).map(([name, value]) => ({ name, value }))
        },
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) {
            setCookie(event, cookie.name, cookie.value, {
              ...cookie.options,
              sameSite: cookie.options.sameSite as true | false | 'lax' | 'strict' | 'none' | undefined
            })
          }
        }
      }
    }
  )
}

export function createServiceSupabaseClient(event?: H3Event) {
  const config = event ? useRuntimeConfig(event) : useRuntimeConfig()

  if (!config.public.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Supabase service role is not configured'
    })
  }

  return createClient(config.public.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

export async function requireUser(event: H3Event): Promise<User> {
  const supabase = createEventSupabaseClient(event)
  const bearer = getHeader(event, 'authorization')?.replace(/^Bearer\s+/i, '')

  if (bearer) {
    const { data, error } = await supabase.auth.getUser(bearer)
    if (!error && data.user) {
      return data.user
    }
  }

  const legacyCookie = getCookie(event, 'sb-access-token')
  if (legacyCookie) {
    const { data, error } = await supabase.auth.getUser(legacyCookie)
    if (!error && data.user) {
      return data.user
    }
  }

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required'
    })
  }

  return data.user
}

export async function ensureProfile(client: SupabaseClient, user: User) {
  const metadata = user.user_metadata || {}

  await client
    .from('profiles')
    .upsert({
      id: user.id,
      github_username: metadata.user_name || metadata.preferred_username || null,
      display_name: metadata.full_name || metadata.name || metadata.user_name || null,
      avatar_url: metadata.avatar_url || null,
      email: user.email || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' })
}
