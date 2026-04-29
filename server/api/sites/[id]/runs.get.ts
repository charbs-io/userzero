import { createError, getRouterParam } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../utils/supabase'
import { getUserSite } from '../../../utils/sites'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id') || ''
  const client = createServiceSupabaseClient(event)
  await getUserSite(client, user.id, id)

  const { data, error } = await client
    .from('qa_runs')
    .select('*')
    .eq('site_id', id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data
})
