import type { SupabaseClient } from '@supabase/supabase-js'
import { createInstallationAccessToken, githubInstallationRequest } from './github-app'

export type GithubRepositoryContext = {
  repository: string
  html_url: string
  default_branch: string
  description: string
  readme_excerpt: string
  package_hints: string[]
  route_hints: string[]
}

type GithubConnection = {
  installation_id: number
  repository_id: number
  owner: string
  repo: string
  full_name: string
  html_url: string
  default_branch: string
}

type GithubRepoResponse = {
  description?: string | null
  html_url: string
  default_branch: string
}

type GithubContentResponse = {
  content?: string
  encoding?: string
}

type GithubTreeResponse = {
  tree?: Array<{
    path?: string
    type?: string
  }>
}

export async function loadGithubRepositoryContext(client: SupabaseClient, userId: string, siteId: string) {
  const { data, error } = await client
    .from('site_github_connections')
    .select('installation_id, repository_id, owner, repo, full_name, html_url, default_branch')
    .eq('site_id', siteId)
    .eq('user_id', userId)
    .eq('use_repository_context', true)
    .is('disconnected_at', null)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  const connection = data as GithubConnection
  const token = await createInstallationAccessToken(undefined, connection.installation_id, {
    repositoryIds: [connection.repository_id],
    permissions: {
      contents: 'read',
      metadata: 'read'
    }
  })
  const repoPath = `/repos/${connection.owner}/${connection.repo}`
  const [repo, readme, packageJson, tree] = await Promise.all([
    githubInstallationRequest<GithubRepoResponse>(token.token, repoPath),
    githubInstallationRequest<GithubContentResponse>(token.token, `${repoPath}/readme`).catch(() => null),
    githubInstallationRequest<GithubContentResponse>(token.token, `${repoPath}/contents/package.json?ref=${encodeURIComponent(connection.default_branch)}`).catch(() => null),
    githubInstallationRequest<GithubTreeResponse>(token.token, `${repoPath}/git/trees/${encodeURIComponent(connection.default_branch)}?recursive=1`).catch(() => null)
  ])

  return {
    repository: connection.full_name,
    html_url: repo.html_url || connection.html_url,
    default_branch: repo.default_branch || connection.default_branch,
    description: repo.description || '',
    readme_excerpt: decodeGithubContent(readme).slice(0, 1800),
    package_hints: readPackageHints(decodeGithubContent(packageJson)),
    route_hints: readRouteHints(tree?.tree || [])
  } satisfies GithubRepositoryContext
}

function decodeGithubContent(content: GithubContentResponse | null) {
  if (!content?.content || content.encoding !== 'base64') {
    return ''
  }

  return Buffer.from(content.content.replace(/\n/g, ''), 'base64').toString('utf8')
}

function readPackageHints(packageJson: string) {
  if (!packageJson) {
    return []
  }

  try {
    const parsed = JSON.parse(packageJson) as {
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const dependencies = {
      ...parsed.dependencies,
      ...parsed.devDependencies
    }
    const frameworks = ['nuxt', 'next', 'react', 'vue', 'svelte', 'astro', 'vite', 'playwright', 'tailwindcss']
      .filter(name => dependencies[name])

    return [
      ...frameworks.map(name => `${name}: ${dependencies[name]}`),
      ...Object.entries(parsed.scripts || {})
        .filter(([name]) => ['dev', 'build', 'test', 'lint', 'typecheck'].includes(name))
        .map(([name, value]) => `script ${name}: ${value}`)
    ].slice(0, 16)
  } catch {
    return []
  }
}

function readRouteHints(tree: Array<{ path?: string, type?: string }>) {
  const routePatterns = [
    /^app\/pages\//,
    /^pages\//,
    /^src\/pages\//,
    /^app\/routes\//,
    /^src\/routes\//,
    /^routes\//,
    /^app\/.*route\./,
    /^src\/.*route\./,
    /^nuxt\.config\./,
    /^vite\.config\./,
    /^next\.config\./
  ]

  return tree
    .filter(item => item.type === 'blob' && item.path && routePatterns.some(pattern => pattern.test(item.path || '')))
    .map(item => item.path as string)
    .slice(0, 80)
}
