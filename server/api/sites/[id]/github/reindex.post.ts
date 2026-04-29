import { createError, getRouterParam } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../../utils/supabase'
import { getSiteGithubConnection, getUserSite } from '../../../../utils/sites'
import { startGithubRepositoryIndex } from '../../../../utils/github-index'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id') || ''
  const client = createServiceSupabaseClient(event)
  await getUserSite(client, user.id, id)
  const connection = await getSiteGithubConnection(client, user.id, id)

  if (!connection || connection.disconnected_at) {
    throw createError({ statusCode: 404, statusMessage: 'GitHub connection not found' })
  }

  if (!connection.use_repository_context) {
    throw createError({ statusCode: 400, statusMessage: 'Repository context is disabled for this site' })
  }

  const now = new Date().toISOString()
  await client
    .from('site_github_connections')
    .update({
      repository_index_status: 'indexing',
      repository_index_started_at: now,
      repository_index_error: null,
      repository_index_file_count: 0,
      updated_at: now
    })
    .eq('site_id', id)
    .eq('user_id', user.id)

  startGithubRepositoryIndex({ siteId: id, userId: user.id })

  return {
    ok: true,
    repository_index_status: 'indexing'
  }
})
