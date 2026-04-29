import { createError } from 'h3'
import { requireUser, createServiceSupabaseClient } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const client = createServiceSupabaseClient(event)

  const { data, error } = await client
    .from('verified_domains')
    .select('id, hostname, verification_method, verified_at, last_checked_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data
})
