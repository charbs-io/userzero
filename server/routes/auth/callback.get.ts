import { getQuery, sendRedirect } from 'h3'
import { createEventSupabaseClient, createServiceSupabaseClient, ensureProfile } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = typeof query.code === 'string' ? query.code : null
  const next = typeof query.next === 'string' && query.next.startsWith('/') ? query.next : '/'

  if (!code) {
    return sendRedirect(event, '/login?error=Missing%20OAuth%20code')
  }

  const supabase = createEventSupabaseClient(event)
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return sendRedirect(event, `/login?error=${encodeURIComponent(error.message)}`)
  }

  const { data } = await supabase.auth.getUser()
  if (data.user) {
    await ensureProfile(createServiceSupabaseClient(event), data.user)
  }

  return sendRedirect(event, next)
})
