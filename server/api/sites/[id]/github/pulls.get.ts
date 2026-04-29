import { z } from 'zod'
import { createError, getQuery, getRouterParam } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../../utils/supabase'
import { createInstallationAccessToken, githubInstallationRequest } from '../../../../utils/github-app'
import { getSiteGithubConnection, getUserSite } from '../../../../utils/sites'

const querySchema = z.object({
  state: z.enum(['open', 'closed', 'all']).default('open')
})

type GithubPullResponse = {
  number: number
  title: string
  state: 'open' | 'closed'
  draft?: boolean
  html_url: string
  body?: string | null
  user?: {
    login?: string
  } | null
  head: {
    ref: string
    sha: string
  }
  base: {
    ref: string
  }
  created_at: string
  updated_at: string
  closed_at?: string | null
  merged_at?: string | null
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id') || ''
  const query = querySchema.parse(getQuery(event))
  const client = createServiceSupabaseClient(event)
  await getUserSite(client, user.id, id)
  const connection = await getSiteGithubConnection(client, user.id, id)

  if (!connection || connection.disconnected_at) {
    throw createError({ statusCode: 404, statusMessage: 'GitHub connection not found' })
  }

  const token = await createInstallationAccessToken(event, connection.installation_id, {
    repositoryIds: [connection.repository_id],
    permissions: {
      metadata: 'read',
      pull_requests: 'read'
    }
  })
  const pulls = await githubInstallationRequest<GithubPullResponse[]>(
    token.token,
    `/repos/${connection.owner}/${connection.repo}/pulls?state=${query.state}&per_page=50&sort=updated&direction=desc`
  )

  return pulls.map(pull => ({
    number: pull.number,
    title: pull.title,
    state: pull.state,
    draft: Boolean(pull.draft),
    html_url: pull.html_url,
    body: pull.body || null,
    user_login: pull.user?.login || 'unknown',
    head_ref: pull.head.ref,
    head_sha: pull.head.sha,
    base_ref: pull.base.ref,
    created_at: pull.created_at,
    updated_at: pull.updated_at,
    closed_at: pull.closed_at || null,
    merged_at: pull.merged_at || null
  }))
})
