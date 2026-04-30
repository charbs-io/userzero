import OpenAI from 'openai'
import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createInstallationAccessToken, githubInstallationRequest } from './github-app'
import { createServiceSupabaseClient } from '../lib/service-supabase'
import { createServerError } from '../lib/errors'
import { fingerprintOpenAIKey, loadUserOpenAIConfig } from './openai-settings'

const maxIndexedFiles = 240
const maxIndexedFileBytes = 140_000
const maxIndexedTotalBytes = 6_000_000

type GithubConnection = {
  site_id: string
  user_id: string
  installation_id: number
  repository_id: number
  owner: string
  repo: string
  full_name: string
  default_branch: string
  repository_vector_store_id: string | null
}

type GithubTreeResponse = {
  tree?: Array<{
    path?: string
    mode?: string
    type?: string
    sha?: string
    size?: number
  }>
}

type GithubContentResponse = {
  content?: string
  encoding?: string
  size?: number
}

type GithubBranchResponse = {
  commit?: {
    sha?: string
  }
}

type IndexedFile = {
  path: string
  sha: string
  size: number
  content: string
}

export async function indexGithubRepository(input: {
  siteId: string
  userId: string
  event?: H3Event
  jobId?: string
}) {
  const client = createServiceSupabaseClient(input.event)
  const connection = await loadIndexConnection(client, input.userId, input.siteId)
  if (!connection) {
    throw createServerError(404, 'GitHub connection not found')
  }

  const openaiConfig = await loadUserOpenAIConfig(client, input.userId, input.event)
  const keyFingerprint = fingerprintOpenAIKey(openaiConfig.apiKey, input.event)
  const openai = new OpenAI({ apiKey: openaiConfig.apiKey })
  const now = new Date().toISOString()

  const indexingPatch: Record<string, string | null> = {
    repository_index_status: 'indexing',
    repository_index_started_at: now,
    repository_index_error: null,
    updated_at: now
  }

  if (input.jobId) {
    indexingPatch.repository_index_job_id = input.jobId
  }

  await client
    .from('site_github_connections')
    .update(indexingPatch)
    .eq('site_id', input.siteId)
    .eq('user_id', input.userId)

  let newVectorStoreId: string | null = null

  try {
    const token = await createInstallationAccessToken(input.event, connection.installation_id, {
      repositoryIds: [connection.repository_id],
      permissions: {
        contents: 'read',
        metadata: 'read'
      }
    })
    const repoPath = `/repos/${connection.owner}/${connection.repo}`
    const branch = connection.default_branch
    const [branchResponse, treeResponse] = await Promise.all([
      githubInstallationRequest<GithubBranchResponse>(token.token, `${repoPath}/branches/${encodeURIComponent(branch)}`),
      githubInstallationRequest<GithubTreeResponse>(token.token, `${repoPath}/git/trees/${encodeURIComponent(branch)}?recursive=1`)
    ])
    const headSha = branchResponse.commit?.sha || null
    const candidates = selectIndexCandidates(treeResponse.tree || [])
    const files = await mapLimit(candidates, 6, async (candidate) => {
      const content = await githubInstallationRequest<GithubContentResponse>(
        token.token,
        `${repoPath}/contents/${encodePath(candidate.path)}?ref=${encodeURIComponent(branch)}`
      ).catch(() => null)

      if (!content || content.encoding !== 'base64' || !content.content) {
        return null
      }

      const decoded = Buffer.from(content.content.replace(/\n/g, ''), 'base64').toString('utf8')
      if (looksBinary(decoded)) {
        return null
      }

      return {
        path: candidate.path,
        sha: candidate.sha,
        size: Buffer.byteLength(decoded),
        content: [
          `Path: ${candidate.path}`,
          `Repository: ${connection.full_name}`,
          `Branch: ${branch}`,
          '',
          decoded
        ].join('\n')
      } satisfies IndexedFile
    })
    const indexedFiles = files.filter(Boolean) as IndexedFile[]

    if (!indexedFiles.length) {
      throw createServerError(422, 'No eligible repository files were found to index')
    }

    const vectorStore = await openai.vectorStores.create({
      name: `ProductWarden ${connection.full_name}`,
      metadata: {
        site_id: connection.site_id,
        repository: connection.full_name,
        branch
      }
    })
    newVectorStoreId = vectorStore.id

    const uploadedFiles = await mapLimit(indexedFiles, 6, async (file) => {
      const uploadedFile = await openai.files.create({
        file: new File([file.content], safeOpenAIFileName(file.path), { type: 'text/plain' }),
        purpose: 'assistants'
      })

      return {
        file,
        fileId: uploadedFile.id
      }
    })

    const batch = await openai.vectorStores.fileBatches.createAndPoll(vectorStore.id, {
      files: uploadedFiles.map(({ file, fileId }) => ({
        file_id: fileId,
        attributes: {
          path: file.path,
          branch,
          sha: file.sha
        }
      }))
    }, { pollIntervalMs: 1000 })

    if (batch.status !== 'completed' || batch.file_counts.failed || batch.file_counts.cancelled) {
      const failedCount = batch.file_counts.failed + batch.file_counts.cancelled
      throw createServerError(502, `OpenAI could not index ${failedCount} repository files`)
    }

    const indexedAt = new Date().toISOString()
    const readyPatch = {
      repository_vector_store_id: vectorStore.id,
      repository_index_status: 'ready',
      repository_indexed_branch: branch,
      repository_indexed_sha: headSha,
      repository_indexed_at: indexedAt,
      repository_index_error: null,
      repository_index_file_count: indexedFiles.length,
      repository_index_openai_key_fingerprint: keyFingerprint,
      updated_at: indexedAt
    }
    let readyQuery = client
      .from('site_github_connections')
      .update(readyPatch)
      .eq('site_id', input.siteId)
      .eq('user_id', input.userId)

    if (input.jobId) {
      readyQuery = readyQuery.eq('repository_index_job_id', input.jobId)
    }

    const { data: updatedConnection, error } = await readyQuery
      .select('site_id')
      .maybeSingle()

    if (error) {
      throw createServerError(500, error.message)
    }

    if (!updatedConnection) {
      await openai.vectorStores.delete(vectorStore.id).catch(() => undefined)
      return {
        stale: true,
        vector_store_id: vectorStore.id,
        file_count: indexedFiles.length,
        indexed_sha: headSha
      }
    }

    if (connection.repository_vector_store_id && connection.repository_vector_store_id !== vectorStore.id) {
      await openai.vectorStores.delete(connection.repository_vector_store_id).catch(() => undefined)
    }

    return {
      stale: false,
      vector_store_id: vectorStore.id,
      file_count: indexedFiles.length,
      indexed_sha: headSha
    }
  } catch (error) {
    if (newVectorStoreId) {
      await openai.vectorStores.delete(newVectorStoreId).catch(() => undefined)
    }
    if (!input.jobId) {
      await markIndexFailed(client, input.userId, input.siteId, error)
    }
    throw error
  }
}

export async function loadReadyRepositoryVectorStore(client: SupabaseClient, userId: string, siteId: string, apiKey: string, event?: H3Event) {
  const { data, error } = await client
    .from('site_github_connections')
    .select('repository_vector_store_id, repository_index_status, repository_index_openai_key_fingerprint')
    .eq('site_id', siteId)
    .eq('user_id', userId)
    .eq('use_repository_context', true)
    .is('disconnected_at', null)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  const row = data as {
    repository_vector_store_id: string | null
    repository_index_status: string
    repository_index_openai_key_fingerprint: string | null
  }

  if (row.repository_index_status !== 'ready' || !row.repository_vector_store_id) {
    return null
  }

  if (row.repository_index_openai_key_fingerprint !== fingerprintOpenAIKey(apiKey, event)) {
    return null
  }

  return row.repository_vector_store_id
}

async function loadIndexConnection(client: SupabaseClient, userId: string, siteId: string) {
  const { data, error } = await client
    .from('site_github_connections')
    .select('site_id, user_id, installation_id, repository_id, owner, repo, full_name, default_branch, repository_vector_store_id')
    .eq('site_id', siteId)
    .eq('user_id', userId)
    .is('disconnected_at', null)
    .maybeSingle()

  if (error) {
    throw createServerError(500, error.message)
  }

  return data as GithubConnection | null
}

async function markIndexFailed(client: SupabaseClient, userId: string, siteId: string, error: unknown) {
  const now = new Date().toISOString()
  await client
    .from('site_github_connections')
    .update({
      repository_index_status: 'failed',
      repository_index_error: error instanceof Error ? error.message : 'Repository indexing failed',
      updated_at: now
    })
    .eq('site_id', siteId)
    .eq('user_id', userId)
}

function selectIndexCandidates(tree: NonNullable<GithubTreeResponse['tree']>) {
  const result: Array<{ path: string, sha: string, size: number }> = []
  let totalBytes = 0

  for (const item of tree) {
    const path = item.path || ''
    const sha = item.sha || ''
    const size = item.size || 0

    if (item.type !== 'blob' || !path || !sha || !isIndexablePath(path) || size > maxIndexedFileBytes) {
      continue
    }

    if (totalBytes + size > maxIndexedTotalBytes || result.length >= maxIndexedFiles) {
      break
    }

    result.push({ path, sha, size })
    totalBytes += size
  }

  return result
}

function isIndexablePath(path: string) {
  const lower = path.toLowerCase()
  const blockedSegments = [
    '.git',
    '.nuxt',
    '.next',
    '.output',
    'node_modules',
    'dist',
    'build',
    'coverage',
    'vendor'
  ]
  const segments = lower.split('/')

  if (segments.some(segment => blockedSegments.includes(segment))) {
    return false
  }

  if (
    lower.includes('/.env')
    || lower.startsWith('.env')
    || lower.endsWith('.pem')
    || lower.endsWith('.key')
    || lower.endsWith('.p12')
    || lower.endsWith('.lock')
    || lower.endsWith('lockfile')
    || lower.endsWith('pnpm-lock.yaml')
    || lower.endsWith('package-lock.json')
    || lower.endsWith('yarn.lock')
    || lower.endsWith('bun.lockb')
  ) {
    return false
  }

  return [
    '.astro',
    '.cjs',
    '.cs',
    '.css',
    '.go',
    '.graphql',
    '.gql',
    '.html',
    '.java',
    '.js',
    '.json',
    '.jsx',
    '.kt',
    '.md',
    '.mjs',
    '.php',
    '.py',
    '.rb',
    '.rs',
    '.scss',
    '.sh',
    '.sql',
    '.svelte',
    '.swift',
    '.toml',
    '.ts',
    '.tsx',
    '.vue',
    '.yaml',
    '.yml'
  ].some(extension => lower.endsWith(extension))
}

function looksBinary(value: string) {
  return value.includes('\u0000')
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = []
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await fn(items[index] as T)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

function encodePath(path: string) {
  return path.split('/').map(part => encodeURIComponent(part)).join('/')
}

function safeOpenAIFileName(path: string) {
  const safeName = path.replace(/[^a-zA-Z0-9._-]/g, '__').slice(-116) || 'repository-file'
  return `${safeName}.txt`
}
