import { z } from 'zod'
import { createError, getQuery } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../utils/supabase'
import { createInstallationAccessToken, githubInstallationRequest } from '../../utils/github-app'

const querySchema = z.object({
  state: z.enum(['open', 'closed', 'all']).default('open'),
  siteId: z.string().uuid().optional()
})

type SiteRow = {
  id: string
  hostname: string
}

type GithubConnectionRow = {
  site_id: string
  installation_id: number
  repository_id: number
  owner: string
  repo: string
  full_name: string
  html_url: string
}

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
  const query = querySchema.parse(getQuery(event))
  const client = createServiceSupabaseClient(event)

  let sitesQuery = client
    .from('sites')
    .select('id, hostname')
    .eq('user_id', user.id)

  if (query.siteId) {
    sitesQuery = sitesQuery.eq('id', query.siteId)
  }

  const { data: sites, error: sitesError } = await sitesQuery

  if (sitesError) {
    throw createError({ statusCode: 500, statusMessage: sitesError.message })
  }

  if (query.siteId && !sites?.length) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  const siteRows = (sites || []) as SiteRow[]
  if (!siteRows.length) {
    return {
      pulls: [],
      connection_count: 0,
      failures: []
    }
  }

  const { data: connections, error: connectionsError } = await client
    .from('site_github_connections')
    .select('site_id, installation_id, repository_id, owner, repo, full_name, html_url')
    .eq('user_id', user.id)
    .is('disconnected_at', null)
    .in('site_id', siteRows.map(site => site.id))

  if (connectionsError) {
    throw createError({ statusCode: 500, statusMessage: connectionsError.message })
  }

  const connectionRows = (connections || []) as GithubConnectionRow[]
  const sitesById = new Map(siteRows.map(site => [site.id, site]))

  const results = await Promise.allSettled(connectionRows.map(async (connection) => {
    const token = await createInstallationAccessToken(event, connection.installation_id, {
      repositoryIds: [connection.repository_id],
      permissions: {
        metadata: 'read',
        pull_requests: 'read'
      }
    })

    const params = new URLSearchParams({
      state: query.state,
      per_page: '50',
      sort: 'updated',
      direction: 'desc'
    })
    const pulls = await githubInstallationRequest<GithubPullResponse[]>(
      token.token,
      `/repos/${encodeURIComponent(connection.owner)}/${encodeURIComponent(connection.repo)}/pulls?${params.toString()}`
    )

    const site = sitesById.get(connection.site_id)

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
      merged_at: pull.merged_at || null,
      site_id: connection.site_id,
      site_hostname: site?.hostname || 'Unknown site',
      repository_full_name: connection.full_name
    }))
  }))

  const pulls = results
    .flatMap(result => result.status === 'fulfilled' ? result.value : [])
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())

  const failures = results.flatMap((result, index) => {
    if (result.status === 'fulfilled') {
      return []
    }

    const connection = connectionRows[index]
    const site = connection ? sitesById.get(connection.site_id) : null

    return [{
      site_id: connection?.site_id || '',
      site_hostname: site?.hostname || 'Unknown site',
      repository_full_name: connection?.full_name || 'Unknown repository',
      message: getErrorMessage(result.reason)
    }]
  })

  return {
    pulls,
    connection_count: connectionRows.length,
    failures
  }
})

function getErrorMessage(error: unknown) {
  const fetchError = error as { statusMessage?: string, message?: string }
  return fetchError.statusMessage || fetchError.message || 'Unexpected error'
}
