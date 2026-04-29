import { createError, getRouterParam } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../../utils/supabase'
import { getUserSite } from '../../../../utils/sites'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id') || ''
  const client = createServiceSupabaseClient(event)
  await getUserSite(client, user.id, id)

  const { error } = await client
    .from('site_github_connections')
    .delete()
    .eq('site_id', id)
    .eq('user_id', user.id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true }
})
