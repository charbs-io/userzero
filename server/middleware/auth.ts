import { getHeader, getRequestURL, sendRedirect } from 'h3'
import { createEventSupabaseClient } from '../utils/supabase'

const publicPaths = new Set(['/', '/login'])

export default defineEventHandler(async (event) => {
  if (!isPageRequest(event)) {
    return
  }

  const pathname = getRequestURL(event).pathname

  if (isPublicPath(pathname)) {
    return
  }

  const config = useRuntimeConfig(event)
  if (!config.public.supabaseUrl || !config.public.supabasePublishableKey) {
    return sendRedirect(event, '/login', 302)
  }

  const supabase = createEventSupabaseClient(event)
  const { data } = await supabase.auth.getUser()

  if (!data.user) {
    return sendRedirect(event, '/login', 302)
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
