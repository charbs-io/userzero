import OpenAI from 'openai'
import { createError, type H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createInstallationAccessToken, githubInstallationRequest } from './github-app'
import { loadUserOpenAIConfig } from './openai-settings'

type QaIssueRow = {
  id: string
  run_id: string
  user_id: string
  step_number: number | null
  category: string
  severity: string
  title: string
  description: string
  evidence: string
  suggested_fix: string
  screenshot_path: string | null
  github_issue_number: number | null
  github_issue_url: string | null
  github_pr_number: number | null
  github_pr_url: string | null
  github_pr_branch: string | null
}

type QaRunRow = {
  id: string
  site_id: string | null
  target_url: string
  target_hostname: string
  persona: string
  goal: string
  report_md: string | null
}

type GithubConnection = {
  site_id: string
  installation_id: number
  repository_id: number
  owner: string
  repo: string
  full_name: string
  html_url: string
  default_branch: string
  allow_issue_creation: boolean
  allow_pr_creation: boolean
  repository_vector_store_id: string | null
  repository_index_status: string
  repository_index_openai_key_fingerprint: string | null
}

type AutomationContext = {
  issue: QaIssueRow
  run: QaRunRow
  connection: GithubConnection
}

type GithubIssueResponse = {
  number: number
  html_url: string
}

type GithubContentResponse = {
  content?: string
  encoding?: string
  size?: number
}

type GithubRefResponse = {
  object?: {
    sha?: string
  }
}

type GithubCommitResponse = {
  sha: string
  tree?: {
    sha?: string
  }
}

type GithubTreeCreateResponse = {
  sha: string
}

type GithubPullResponse = {
  number: number
  html_url: string
}

const relevantFilesSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    files: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 5
    },
    rationale: { type: 'string' }
  },
  required: ['files', 'rationale']
} as const

const patchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    commit_message: { type: 'string' },
    pr_title: { type: 'string' },
    pr_body: { type: 'string' },
    edits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string' },
          search: { type: 'string' },
          replace: { type: 'string' }
        },
        required: ['path', 'search', 'replace']
      }
    }
  },
  required: ['summary', 'commit_message', 'pr_title', 'pr_body', 'edits']
} as const

export async function createGithubIssueFromQaIssue(client: SupabaseClient, userId: string, issueId: string, event?: H3Event) {
  const context = await loadAutomationContext(client, userId, issueId)

  if (!context.connection.allow_issue_creation) {
    throw createError({ statusCode: 403, statusMessage: 'GitHub issue creation is disabled for this site' })
  }

  if (context.issue.github_issue_number && context.issue.github_issue_url) {
    return {
      number: context.issue.github_issue_number,
      html_url: context.issue.github_issue_url
    }
  }

  const token = await createInstallationAccessToken(event, context.connection.installation_id, {
    repositoryIds: [context.connection.repository_id],
    permissions: {
      issues: 'write',
      metadata: 'read'
    }
  })
  const response = await githubInstallationRequest<GithubIssueResponse>(
    token.token,
    repoApiPath(context.connection, '/issues'),
    {
      method: 'POST',
      body: JSON.stringify({
        title: context.issue.title,
        body: buildGithubIssueBody(context)
      })
    }
  )
  const now = new Date().toISOString()
  const { error } = await client
    .from('qa_issues')
    .update({
      github_issue_number: response.number,
      github_issue_url: response.html_url,
      github_issue_created_at: now
    })
    .eq('id', issueId)
    .eq('user_id', userId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return response
}

export async function createGithubPullRequestFromQaIssue(client: SupabaseClient, userId: string, issueId: string, event?: H3Event) {
  const context = await loadAutomationContext(client, userId, issueId)

  if (!context.connection.allow_pr_creation) {
    throw createError({ statusCode: 403, statusMessage: 'GitHub pull request creation is disabled for this site' })
  }

  if (context.issue.github_pr_number && context.issue.github_pr_url) {
    return {
      number: context.issue.github_pr_number,
      html_url: context.issue.github_pr_url,
      branch: context.issue.github_pr_branch
    }
  }

  const openaiConfig = await loadUserOpenAIConfig(client, userId, event)
  if (
    context.connection.repository_index_status !== 'ready'
    || !context.connection.repository_vector_store_id
    || context.connection.repository_index_openai_key_fingerprint !== openaiConfig.keyFingerprint
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Repository index is not ready for AI pull request creation' })
  }

  const openai = new OpenAI({ apiKey: openaiConfig.apiKey })
  const token = await createInstallationAccessToken(event, context.connection.installation_id, {
    repositoryIds: [context.connection.repository_id],
    permissions: {
      contents: 'write',
      issues: 'read',
      metadata: 'read',
      pull_requests: 'write'
    }
  })
  const files = await identifyRelevantFiles(openai, openaiConfig.model, context)
  const fileContents = await fetchGithubFiles(token.token, context.connection, files)
  const patch = await generatePatch(openai, openaiConfig.model, context, fileContents)
  const updatedFiles = applyExactPatch(fileContents, patch.edits)

  if (!updatedFiles.size) {
    throw createError({ statusCode: 422, statusMessage: 'AI did not produce any file changes' })
  }

  const branch = `productwarden/issue-${context.issue.id.slice(0, 8)}`
  const pullRequest = await createPatchPullRequest(token.token, context, branch, patch, updatedFiles)
  const now = new Date().toISOString()
  const { error } = await client
    .from('qa_issues')
    .update({
      github_pr_number: pullRequest.number,
      github_pr_url: pullRequest.html_url,
      github_pr_branch: branch,
      github_pr_created_at: now
    })
    .eq('id', issueId)
    .eq('user_id', userId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    number: pullRequest.number,
    html_url: pullRequest.html_url,
    branch
  }
}

async function loadAutomationContext(client: SupabaseClient, userId: string, issueId: string): Promise<AutomationContext> {
  const { data: issue, error: issueError } = await client
    .from('qa_issues')
    .select('*')
    .eq('id', issueId)
    .eq('user_id', userId)
    .single()

  if (issueError || !issue) {
    throw createError({ statusCode: 404, statusMessage: 'QA issue not found' })
  }

  const issueRow = issue as QaIssueRow
  const { data: run, error: runError } = await client
    .from('qa_runs')
    .select('id, site_id, target_url, target_hostname, persona, goal, report_md')
    .eq('id', issueRow.run_id)
    .eq('user_id', userId)
    .single()

  if (runError || !run) {
    throw createError({ statusCode: 404, statusMessage: 'QA run not found' })
  }

  const runRow = run as QaRunRow
  if (!runRow.site_id) {
    throw createError({ statusCode: 400, statusMessage: 'This run is not linked to a site GitHub connection' })
  }

  const { data: connection, error: connectionError } = await client
    .from('site_github_connections')
    .select('site_id, installation_id, repository_id, owner, repo, full_name, html_url, default_branch, allow_issue_creation, allow_pr_creation, repository_vector_store_id, repository_index_status, repository_index_openai_key_fingerprint')
    .eq('site_id', runRow.site_id)
    .eq('user_id', userId)
    .is('disconnected_at', null)
    .single()

  if (connectionError || !connection) {
    throw createError({ statusCode: 404, statusMessage: 'GitHub connection not found' })
  }

  return {
    issue: issueRow,
    run: runRow,
    connection: connection as GithubConnection
  }
}

function buildGithubIssueBody(context: AutomationContext) {
  return [
    `Product Warden found this ${context.issue.severity} ${context.issue.category} issue while testing ${context.run.target_url}.`,
    '',
    '## Finding',
    context.issue.description,
    '',
    '## Evidence',
    context.issue.evidence,
    '',
    '## Suggested fix',
    context.issue.suggested_fix,
    '',
    '## Run context',
    `- Persona: ${context.run.persona}`,
    `- Goal: ${context.run.goal}`,
    `- Step: ${context.issue.step_number || 'unknown'}`,
    context.issue.screenshot_path ? `- Screenshot path: ${context.issue.screenshot_path}` : '- Screenshot path: none'
  ].join('\n')
}

async function identifyRelevantFiles(openai: OpenAI, model: string, context: AutomationContext) {
  const response = await openai.responses.create({
    model,
    instructions: [
      'You choose existing repository files that are most likely to need edits for a QA issue.',
      'Use file search. Return only paths that exist in the repository.',
      'Prefer the smallest set of files, up to five.'
    ].join('\n'),
    input: [{
      role: 'user',
      content: [{
        type: 'input_text',
        text: JSON.stringify({
          repository: context.connection.full_name,
          issue: {
            title: context.issue.title,
            category: context.issue.category,
            severity: context.issue.severity,
            description: context.issue.description,
            evidence: context.issue.evidence,
            suggested_fix: context.issue.suggested_fix
          },
          run: {
            target_url: context.run.target_url,
            persona: context.run.persona,
            goal: context.run.goal
          }
        })
      }]
    }],
    tools: [{
      type: 'file_search',
      vector_store_ids: [context.connection.repository_vector_store_id as string]
    }],
    text: {
      format: {
        type: 'json_schema',
        name: 'productwarden_relevant_files',
        strict: true,
        schema: relevantFilesSchema
      }
    }
  })
  const parsed = JSON.parse(response.output_text) as { files: string[], rationale: string }
  const files = parsed.files.map(normalizeRepoPath).filter(Boolean)

  if (!files.length) {
    throw createError({ statusCode: 422, statusMessage: 'AI could not identify files to edit' })
  }

  return Array.from(new Set(files)).slice(0, 5)
}

async function fetchGithubFiles(token: string, connection: GithubConnection, files: string[]) {
  const result = new Map<string, string>()

  for (const path of files) {
    const response = await githubInstallationRequest<GithubContentResponse>(
      token,
      `${repoApiPath(connection, `/contents/${encodePath(path)}`)}?ref=${encodeURIComponent(connection.default_branch)}`
    )

    if (response.encoding !== 'base64' || !response.content) {
      throw createError({ statusCode: 422, statusMessage: `Could not read ${path} from GitHub` })
    }

    const content = Buffer.from(response.content.replace(/\n/g, ''), 'base64').toString('utf8')
    if (Buffer.byteLength(content) > 220_000) {
      throw createError({ statusCode: 422, statusMessage: `${path} is too large for an AI patch` })
    }

    result.set(path, content)
  }

  return result
}

async function generatePatch(openai: OpenAI, model: string, context: AutomationContext, fileContents: Map<string, string>) {
  const response = await openai.responses.create({
    model,
    instructions: [
      'You generate conservative code edits for a Product Warden QA issue.',
      'You may only edit files provided in the input.',
      'Every edit must include a search string copied exactly from the provided file content and a replacement string.',
      'Prefer the smallest safe fix. Do not invent unrelated features.'
    ].join('\n'),
    input: [{
      role: 'user',
      content: [{
        type: 'input_text',
        text: JSON.stringify({
          repository: context.connection.full_name,
          issue: {
            title: context.issue.title,
            category: context.issue.category,
            severity: context.issue.severity,
            description: context.issue.description,
            evidence: context.issue.evidence,
            suggested_fix: context.issue.suggested_fix
          },
          run: {
            target_url: context.run.target_url,
            persona: context.run.persona,
            goal: context.run.goal
          },
          files: Array.from(fileContents.entries()).map(([path, content]) => ({
            path,
            content
          }))
        })
      }]
    }],
    tools: [{
      type: 'file_search',
      vector_store_ids: [context.connection.repository_vector_store_id as string]
    }],
    text: {
      format: {
        type: 'json_schema',
        name: 'productwarden_patch',
        strict: true,
        schema: patchSchema
      }
    }
  })

  return JSON.parse(response.output_text) as {
    summary: string
    commit_message: string
    pr_title: string
    pr_body: string
    edits: Array<{ path: string, search: string, replace: string }>
  }
}

function applyExactPatch(fileContents: Map<string, string>, edits: Array<{ path: string, search: string, replace: string }>) {
  const working = new Map(fileContents)
  const changed = new Map<string, string>()

  for (const edit of edits) {
    const path = normalizeRepoPath(edit.path)
    if (!path || !working.has(path)) {
      throw createError({ statusCode: 422, statusMessage: `AI proposed an edit for an unavailable file: ${edit.path}` })
    }

    if (!edit.search) {
      throw createError({ statusCode: 422, statusMessage: `AI proposed an empty search block for ${path}` })
    }

    const current = working.get(path) as string
    const occurrences = countOccurrences(current, edit.search)
    if (occurrences !== 1) {
      throw createError({
        statusCode: 422,
        statusMessage: `Patch for ${path} is unsafe because the search block matched ${occurrences} times`
      })
    }

    const next = current.replace(edit.search, edit.replace)
    working.set(path, next)
    if (next !== fileContents.get(path)) {
      changed.set(path, next)
    }
  }

  return changed
}

async function createPatchPullRequest(
  token: string,
  context: AutomationContext,
  branch: string,
  patch: { commit_message: string, pr_title: string, pr_body: string },
  updatedFiles: Map<string, string>
) {
  const baseRef = await githubInstallationRequest<GithubRefResponse>(
    token,
    repoApiPath(context.connection, `/git/ref/heads/${encodeGitRef(context.connection.default_branch)}`)
  )
  const baseSha = baseRef.object?.sha
  if (!baseSha) {
    throw createError({ statusCode: 502, statusMessage: 'Could not read default branch SHA from GitHub' })
  }

  const baseCommit = await githubInstallationRequest<GithubCommitResponse>(
    token,
    repoApiPath(context.connection, `/git/commits/${baseSha}`)
  )
  const baseTree = baseCommit.tree?.sha
  if (!baseTree) {
    throw createError({ statusCode: 502, statusMessage: 'Could not read default branch tree from GitHub' })
  }

  const tree = await githubInstallationRequest<GithubTreeCreateResponse>(
    token,
    repoApiPath(context.connection, '/git/trees'),
    {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTree,
        tree: Array.from(updatedFiles.entries()).map(([path, content]) => ({
          path,
          mode: '100644',
          type: 'blob',
          content
        }))
      })
    }
  )
  const commit = await githubInstallationRequest<GithubCommitResponse>(
    token,
    repoApiPath(context.connection, '/git/commits'),
    {
      method: 'POST',
      body: JSON.stringify({
        message: patch.commit_message || `Fix Product Warden issue ${context.issue.id.slice(0, 8)}`,
        tree: tree.sha,
        parents: [baseSha]
      })
    }
  )

  await githubInstallationRequest<GithubRefResponse>(
    token,
    repoApiPath(context.connection, '/git/refs'),
    {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: commit.sha
      })
    }
  )

  return await githubInstallationRequest<GithubPullResponse>(
    token,
    repoApiPath(context.connection, '/pulls'),
    {
      method: 'POST',
      body: JSON.stringify({
        title: patch.pr_title || context.issue.title,
        head: branch,
        base: context.connection.default_branch,
        body: [
          patch.pr_body,
          '',
          `Product Warden issue: ${context.issue.title}`,
          `Run URL: ${context.run.target_url}`
        ].join('\n')
      })
    }
  )
}

function repoApiPath(connection: Pick<GithubConnection, 'owner' | 'repo'>, suffix: string) {
  return `/repos/${connection.owner}/${connection.repo}${suffix}`
}

function normalizeRepoPath(path: string) {
  const cleaned = path.trim().replace(/^`+|`+$/g, '').replace(/^\.?\//, '')
  if (!cleaned || cleaned.includes('..')) {
    return ''
  }

  return cleaned
}

function encodePath(path: string) {
  return path.split('/').map(part => encodeURIComponent(part)).join('/')
}

function encodeGitRef(ref: string) {
  return ref.split('/').map(part => encodeURIComponent(part)).join('/')
}

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1
}
