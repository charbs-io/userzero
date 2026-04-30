import { createError, getRouterParam } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../../utils/supabase'
import { getSiteGithubConnection, getUserSite } from '../../../../utils/sites'
import { enqueueGithubRepositoryIndex } from '../../../../utils/github-index-jobs'

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

  const jobId = await enqueueGithubRepositoryIndex(client, user.id, id)

  return {
    ok: true,
    job_id: jobId,
    repository_index_status: 'indexing'
  }
})
