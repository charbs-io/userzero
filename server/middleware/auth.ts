import { getHeader, getRequestURL, sendRedirect } from 'h3'
import { DEFAULT_AUTH_REDIRECT, getLoginPath, getSafeAuthRedirect } from '#shared/utils/auth-redirect'
import { createEventSupabaseClient } from '../utils/supabase'

const publicPaths = new Set(['/'])

export default defineEventHandler(async (event) => {
  if (!isPageRequest(event)) {
    return
  }

  const url = getRequestURL(event)
  const pathname = url.pathname

  if (pathname === '/login') {
    const config = useRuntimeConfig(event)

    if (!config.public.supabaseUrl || !config.public.supabasePublishableKey) {
      return
    }

    const supabase = createEventSupabaseClient(event)
    const { data } = await supabase.auth.getUser()

    if (data.user) {
      return sendRedirect(event, getAuthenticatedLoginRedirect(event), 302)
    }

    return
  }

  if (isPublicPath(pathname)) {
    return
  }

  const config = useRuntimeConfig(event)
  if (!config.public.supabaseUrl || !config.public.supabasePublishableKey) {
    return sendRedirect(event, getLoginPath(`${url.pathname}${url.search}`), 302)
  }

  const supabase = createEventSupabaseClient(event)
  const { data } = await supabase.auth.getUser()

  if (!data.user) {
    return sendRedirect(event, getLoginPath(`${url.pathname}${url.search}`), 302)
  }
})

function isPageRequest(event: Parameters<typeof getRequestURL>[0]) {
  if (!['GET', 'HEAD'].includes(event.method)) {
    return false
  }

  const pathname = getRequestURL(event).pathname

  if (pathname.startsWith('/api/')
    || pathname.startsWith('/_nuxt/')
    || pathname.startsWith('/__nuxt')
    || pathname === '/favicon.ico') {
    return false
  }

  const accept = getHeader(event, 'accept') || ''
  return accept.includes('text/html') || accept.includes('*/*')
}

function isPublicPath(pathname: string) {
  return publicPaths.has(pathname) || pathname.startsWith('/auth/callback')
}

function getAuthenticatedLoginRedirect(event: Parameters<typeof getRequestURL>[0]) {
  const url = getRequestURL(event)
  const next = getSafeAuthRedirect(url.searchParams.get('next'))

  if (next) {
    return next
  }

  const referer = getHeader(event, 'referer')
  if (referer) {
    try {
      const refererUrl = new URL(referer)

      if (refererUrl.origin === url.origin
        && (refererUrl.pathname === '/' || refererUrl.pathname.startsWith('/app'))) {
        return `${refererUrl.pathname}${refererUrl.search}`
      }
    } catch {
      return DEFAULT_AUTH_REDIRECT
    }
  }

  return DEFAULT_AUTH_REDIRECT
}
