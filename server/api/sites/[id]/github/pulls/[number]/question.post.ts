import OpenAI from 'openai'
import { z } from 'zod'
import { createError, getRouterParam, readValidatedBody } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../../../../utils/supabase'
import { createInstallationAccessToken, githubInstallationRequest } from '../../../../../../utils/github-app'
import { fingerprintOpenAIKey, loadUserOpenAIConfig } from '../../../../../../utils/openai-settings'
import { getUserSite } from '../../../../../../utils/sites'

const schema = z.object({
  question: z.string().min(3).max(2000)
})

type GithubConnection = {
  installation_id: number
  repository_id: number
  owner: string
  repo: string
  full_name: string
  repository_vector_store_id: string | null
  repository_index_status: string
  repository_index_openai_key_fingerprint: string | null
}

type GithubPullResponse = {
  number: number
  title: string
  state: string
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

type GithubPullFile = {
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch?: string
}

type GithubIssueComment = {
  user?: {
    login?: string
  } | null
  body?: string | null
  created_at: string
}

type GithubReviewComment = GithubIssueComment & {
  path?: string
  diff_hunk?: string
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const siteId = getRouterParam(event, 'id') || ''
  const pullNumber = Number(getRouterParam(event, 'number') || 0)
  const body = await readValidatedBody(event, schema.parse)

  if (!pullNumber || !Number.isInteger(pullNumber)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid pull request number' })
  }

  const client = createServiceSupabaseClient(event)
  await getUserSite(client, user.id, siteId)
  const { data: connection, error } = await client
    .from('site_github_connections')
    .select('installation_id, repository_id, owner, repo, full_name, repository_vector_store_id, repository_index_status, repository_index_openai_key_fingerprint')
    .eq('site_id', siteId)
    .eq('user_id', user.id)
    .is('disconnected_at', null)
    .single()

  if (error || !connection) {
    throw createError({ statusCode: 404, statusMessage: 'GitHub connection not found' })
  }

  const row = connection as GithubConnection
  const openaiConfig = await loadUserOpenAIConfig(client, user.id, event)
  if (
    row.repository_index_status !== 'ready'
    || !row.repository_vector_store_id
    || row.repository_index_openai_key_fingerprint !== fingerprintOpenAIKey(openaiConfig.apiKey, event)
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Repository index is not ready for PR Q&A' })
  }

  const token = await createInstallationAccessToken(event, row.installation_id, {
    repositoryIds: [row.repository_id],
    permissions: {
      issues: 'read',
      metadata: 'read',
      pull_requests: 'read'
    }
  })
  const repoPath = `/repos/${row.owner}/${row.repo}`
  const [pull, files, comments, reviewComments] = await Promise.all([
    githubInstallationRequest<GithubPullResponse>(token.token, `${repoPath}/pulls/${pullNumber}`),
    githubInstallationRequest<GithubPullFile[]>(token.token, `${repoPath}/pulls/${pullNumber}/files?per_page=100`),
    githubInstallationRequest<GithubIssueComment[]>(token.token, `${repoPath}/issues/${pullNumber}/comments?per_page=50`),
    githubInstallationRequest<GithubReviewComment[]>(token.token, `${repoPath}/pulls/${pullNumber}/comments?per_page=50`)
  ])

  const openai = new OpenAI({ apiKey: openaiConfig.apiKey })
  const response = await openai.responses.create({
    model: openaiConfig.model,
    instructions: [
      'You answer Product Warden user questions about a GitHub pull request.',
      'Use the PR metadata, changed files, comments, and repository file search.',
      'Be specific. Mention filenames when relevant. If the available context is insufficient, say what is missing.'
    ].join('\n'),
    input: [{
      role: 'user',
      content: [{
        type: 'input_text',
        text: JSON.stringify({
          question: body.question,
          repository: row.full_name,
          pull_request: {
            number: pull.number,
            title: pull.title,
            state: pull.state,
            draft: Boolean(pull.draft),
            url: pull.html_url,
            body: pull.body || '',
            author: pull.user?.login || 'unknown',
            head_ref: pull.head.ref,
            head_sha: pull.head.sha,
            base_ref: pull.base.ref,
            created_at: pull.created_at,
            updated_at: pull.updated_at,
            closed_at: pull.closed_at || null,
            merged_at: pull.merged_at || null
          },
          files: files.map(file => ({
            filename: file.filename,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
            changes: file.changes,
            patch: (file.patch || '').slice(0, 12000)
          })),
          comments: comments.slice(-20).map(comment => ({
            author: comment.user?.login || 'unknown',
            body: comment.body || '',
            created_at: comment.created_at
          })),
          review_comments: reviewComments.slice(-20).map(comment => ({
            author: comment.user?.login || 'unknown',
            path: comment.path || '',
            diff_hunk: comment.diff_hunk || '',
            body: comment.body || '',
            created_at: comment.created_at
          }))
        })
      }]
    }],
    tools: [{
      type: 'file_search',
      vector_store_ids: [row.repository_vector_store_id]
    }]
  })

  return {
    answer: response.output_text
  }
})
