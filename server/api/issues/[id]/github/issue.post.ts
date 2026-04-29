import { getRouterParam } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../../utils/supabase'
import { createGithubIssueFromQaIssue } from '../../../../utils/github-automation'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id') || ''
  const client = createServiceSupabaseClient(event)

  return await createGithubIssueFromQaIssue(client, user.id, id, event)
})
