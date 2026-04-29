import { z } from 'zod'
import { createError, readValidatedBody } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../utils/supabase'
import { assertHostnameCovered, assertPublicHostname, normalizeTargetUrl } from '../../utils/security'
import { loadUserOpenAIConfig } from '../../utils/openai-settings'
import { startQaRun } from '../../utils/agent/runner'
import { loadGithubRepositoryContext } from '../../utils/github-context'
import { loadReadyRepositoryVectorStore } from '../../utils/github-index'

const schema = z.object({
  siteId: z.string().uuid(),
  url: z.string().url().optional(),
  persona: z.string().min(3).max(500),
  goal: z.string().min(3).max(1000),
  maxSteps: z.number().int().min(3).max(40).default(20),
  credentials: z.object({
    username: z.string().optional(),
    password: z.string().optional()
  }).optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, schema.parse)
  const client = createServiceSupabaseClient(event)

  const { data: site, error: siteError } = await client
    .from('sites')
    .select('id, base_url, hostname, verified_at')
    .eq('id', body.siteId)
    .eq('user_id', user.id)
    .single()

  if (siteError || !site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  if (!site.verified_at) {
    throw createError({ statusCode: 403, statusMessage: 'Verify this site before starting a run' })
  }

  const target = normalizeTargetUrl(body.url || site.base_url)
  const verifiedHostnames = [site.hostname]
  assertHostnameCovered(target.hostname, verifiedHostnames)
  await assertPublicHostname(target.hostname)
  const openai = await loadUserOpenAIConfig(client, user.id, event)
  const [githubContext, repositoryVectorStoreId] = await Promise.all([
    loadGithubRepositoryContext(client, user.id, site.id).catch(() => null),
    loadReadyRepositoryVectorStore(client, user.id, site.id, openai.apiKey, event)
  ])

  const { data: run, error } = await client
    .from('qa_runs')
    .insert({
      user_id: user.id,
      site_id: site.id,
      target_url: target.toString(),
      target_hostname: target.hostname,
      persona: body.persona,
      goal: body.goal,
      max_steps: body.maxSteps,
      status: 'queued'
    })
    .select('*')
    .single()

  if (error || !run) {
    throw createError({ statusCode: 500, statusMessage: error?.message || 'Could not create run' })
  }

  startQaRun({
    runId: run.id,
    userId: user.id,
    targetUrl: run.target_url,
    persona: run.persona,
    goal: run.goal,
    maxSteps: run.max_steps,
    verifiedHostnames,
    githubContext,
    repositoryVectorStoreId,
    credentials: {
      username: body.credentials?.username,
      password: body.credentials?.password
    },
    openai
  })

  return run
})
