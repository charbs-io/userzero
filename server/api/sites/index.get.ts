import { createError } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../utils/supabase'
import { attachGithubConnections } from '../../utils/sites'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const client = createServiceSupabaseClient(event)

  const { data, error } = await client
    .from('sites')
    .select('id, user_id, base_url, hostname, verification_method, verified_at, last_checked_at, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return attachGithubConnections(client, user.id, data || [])
})
