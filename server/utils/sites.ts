import { createError } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'

type SiteRow = {
  id: string
  user_id: string
  base_url: string
  hostname: string
  verification_method: 'meta' | 'txt' | null
  verified_at: string | null
  last_checked_at: string | null
  created_at: string
  updated_at: string
}

type GithubConnectionRow = {
  site_id: string
  installation_id: number
  repository_id: number
  owner: string
  repo: string
  full_name: string
  html_url: string
  default_branch: string
  permissions: Record<string, unknown>
  use_repository_context: boolean
  allow_issue_creation: boolean
  allow_pr_creation: boolean
  repository_index_status: 'not_indexed' | 'indexing' | 'ready' | 'failed'
  repository_indexed_branch: string | null
  repository_indexed_sha: string | null
  repository_index_started_at: string | null
  repository_indexed_at: string | null
  repository_index_error: string | null
  repository_index_file_count: number
  connected_at: string
  disconnected_at: string | null
  updated_at: string
}

const publicGithubConnectionSelect = [
  'site_id',
  'installation_id',
  'repository_id',
  'owner',
  'repo',
  'full_name',
  'html_url',
  'default_branch',
  'permissions',
  'use_repository_context',
  'allow_issue_creation',
  'allow_pr_creation',
  'repository_index_status',
  'repository_indexed_branch',
  'repository_indexed_sha',
  'repository_index_started_at',
  'repository_indexed_at',
  'repository_index_error',
  'repository_index_file_count',
  'connected_at',
  'disconnected_at',
  'updated_at'
].join(', ')

export async function getUserSite(client: SupabaseClient, userId: string, siteId: string) {
  const { data, error } = await client
    .from('sites')
    .select('id, user_id, base_url, hostname, verification_method, verified_at, last_checked_at, created_at, updated_at')
    .eq('id', siteId)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  return data as SiteRow
}

export async function getUserSiteForVerification(client: SupabaseClient, userId: string, siteId: string) {
  const { data, error } = await client
    .from('sites')
    .select('id, user_id, base_url, hostname, token_hash')
    .eq('id', siteId)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  return data as Pick<SiteRow, 'id' | 'user_id' | 'base_url' | 'hostname'> & { token_hash: string }
}

export async function getSiteGithubConnection(client: SupabaseClient, userId: string, siteId: string) {
  const { data, error } = await client
    .from('site_github_connections')
    .select(publicGithubConnectionSelect)
    .eq('site_id', siteId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data as GithubConnectionRow | null
}

export async function attachGithubConnections(client: SupabaseClient, userId: string, sites: SiteRow[]) {
  if (!sites.length) {
    return []
  }

  const { data, error } = await client
    .from('site_github_connections')
    .select(publicGithubConnectionSelect)
    .eq('user_id', userId)
    .in('site_id', sites.map(site => site.id))

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const connections = (data || []) as unknown as GithubConnectionRow[]
  const bySiteId = new Map(connections.map(connection => [connection.site_id, connection]))

  return sites.map(site => ({
    ...site,
    github_connection: bySiteId.get(site.id) || null
  }))
}
