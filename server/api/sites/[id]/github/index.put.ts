import { z } from 'zod'
import { createError, getRouterParam, readValidatedBody } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../../utils/supabase'
import {
  createInstallationAccessToken,
  getGithubInstallation,
  githubInstallationRequest,
  type GithubInstallationPermissions,
  type GithubRepository
} from '../../../../utils/github-app'
import { getUserSite } from '../../../../utils/sites'
import { enqueueGithubRepositoryIndex } from '../../../../utils/github-index-jobs'

const schema = z.object({
  installationId: z.number().int().positive(),
  repositoryId: z.number().int().positive(),
  useRepositoryContext: z.boolean().default(true),
  allowIssueCreation: z.boolean().default(false),
  allowPrCreation: z.boolean().default(false)
})

type RepositoriesResponse = {
  repositories: GithubRepository[]
}

const permissionNames: Record<string, string> = {
  contents: 'Contents',
  issues: 'Issues',
  metadata: 'Metadata',
  pull_requests: 'Pull requests'
}

const permissionRank = {
  read: 1,
  write: 2
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id') || ''
  const body = await readValidatedBody(event, schema.parse)
  const client = createServiceSupabaseClient(event)
  await getUserSite(client, user.id, id)

  const permissions = buildRequiredPermissions(body)
  const installation = await getGithubInstallation(event, body.installationId)
  const missingPermissions = getMissingPermissions(installation.permissions, permissions)

  if (missingPermissions.length) {
    throw createError({
      statusCode: 422,
      statusMessage: `This GitHub App installation has not approved the required permissions: ${missingPermissions.join(', ')}. Approve the updated GitHub App permissions in GitHub, or turn off issue and pull request creation for this site.`
    })
  }

  const token = await createInstallationAccessToken(event, body.installationId, {
    repositoryIds: [body.repositoryId],
    permissions
  })
  const response = await githubInstallationRequest<RepositoriesResponse>(token.token, '/installation/repositories?per_page=100')
  const repository = response.repositories.find(repo => repo.id === body.repositoryId)

  if (!repository) {
    throw createError({ statusCode: 400, statusMessage: 'Selected repository is not available to this GitHub App installation' })
  }

  const now = new Date().toISOString()
  const { data, error } = await client
    .from('site_github_connections')
    .upsert({
      site_id: id,
      user_id: user.id,
      installation_id: body.installationId,
      repository_id: repository.id,
      owner: repository.owner.login,
      repo: repository.name,
      full_name: repository.full_name,
      html_url: repository.html_url,
      default_branch: repository.default_branch,
      permissions: token.permissions || repository.permissions || {},
      use_repository_context: body.useRepositoryContext,
      allow_issue_creation: body.allowIssueCreation,
      allow_pr_creation: body.allowPrCreation,
      repository_index_job_id: null,
      repository_index_status: body.useRepositoryContext ? 'indexing' : 'not_indexed',
      repository_index_error: null,
      repository_index_file_count: 0,
      connected_at: now,
      disconnected_at: null,
      updated_at: now
    }, { onConflict: 'site_id' })
    .select('site_id, installation_id, repository_id, owner, repo, full_name, html_url, default_branch, permissions, use_repository_context, allow_issue_creation, allow_pr_creation, repository_index_status, repository_indexed_branch, repository_indexed_sha, repository_index_started_at, repository_indexed_at, repository_index_error, repository_index_file_count, connected_at, disconnected_at, updated_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  if (body.useRepositoryContext) {
    await enqueueGithubRepositoryIndex(client, user.id, id)
  }

  return data
})

function buildRequiredPermissions(body: z.infer<typeof schema>) {
  const permissions: GithubInstallationPermissions = {
    metadata: 'read'
  }

  if (body.useRepositoryContext || body.allowPrCreation) {
    permissions.contents = body.allowPrCreation ? 'write' : 'read'
  }

  if (body.allowIssueCreation || body.allowPrCreation) {
    permissions.issues = body.allowIssueCreation ? 'write' : 'read'
  }

  if (body.allowPrCreation) {
    permissions.pull_requests = 'write'
  }

  return permissions
}

function getMissingPermissions(granted: GithubInstallationPermissions, required: GithubInstallationPermissions) {
  return Object.entries(required)
    .filter(([permission, level]) => !hasPermission(granted[permission], level))
    .map(([permission, level]) => `${permissionNames[permission] || permission} ${level}`)
}

function hasPermission(granted: GithubInstallationPermissions[string] | undefined, required: GithubInstallationPermissions[string]) {
  return Boolean(granted && permissionRank[granted] >= permissionRank[required])
}
