import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_AUTH_REDIRECT, getSafeAuthRedirect } from '#shared/utils/auth-redirect'

const publicRoutes = new Set(['/'])

export default defineNuxtRouteMiddleware(async (to, from) => {
  if (publicRoutes.has(to.path) || to.path.startsWith('/auth/callback')) {
    return
  }

  const supabase = useNuxtApp().$supabase as SupabaseClient | null
  if (!supabase) {
    if (to.path === '/login') {
      return
    }

    return navigateTo('/login')
  }

  const { data } = await supabase.auth.getSession()

  if (to.path === '/login') {
    if (data.session) {
      return navigateTo(getAuthenticatedLoginRedirect(to.query.next, from), { replace: true })
    }

    return
  }

  if (!data.session) {
    return navigateTo({
      path: '/login',
      query: {
        next: to.fullPath
      }
    })
  }
})

function getAuthenticatedLoginRedirect(next: unknown, from: { path: string, fullPath: string, matched?: unknown[] }) {
  const safeNext = getSafeAuthRedirect(next)

  if (safeNext) {
    return safeNext
  }

  if ((from.matched?.length ?? 0) > 0 && (from.path === '/' || from.path.startsWith('/app'))) {
    return from.fullPath
  }

  return DEFAULT_AUTH_REDIRECT
}
