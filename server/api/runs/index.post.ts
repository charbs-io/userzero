import { z } from 'zod'
import { createError, readValidatedBody } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../utils/supabase'
import { assertHostnameCovered, assertPublicHostname, normalizeTargetUrl } from '../../utils/security'
import { loadUserOpenAIConfig } from '../../utils/openai-settings'
import { startQaRun } from '../../utils/agent/runner'

const schema = z.object({
  url: z.string().url(),
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
  const target = normalizeTargetUrl(body.url)
  const client = createServiceSupabaseClient(event)

  const { data: domains, error: domainError } = await client
    .from('verified_domains')
    .select('hostname')
    .eq('user_id', user.id)
    .not('verified_at', 'is', null)

  if (domainError) {
    throw createError({ statusCode: 500, statusMessage: domainError.message })
  }

  const verifiedDomains = (domains || []).map(domain => domain.hostname)
  assertHostnameCovered(target.hostname, verifiedDomains)
  await assertPublicHostname(target.hostname)
  const openai = await loadUserOpenAIConfig(client, user.id, event)

  const { data: run, error } = await client
    .from('qa_runs')
    .insert({
      user_id: user.id,
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
    verifiedDomains,
    credentials: {
      username: body.credentials?.username,
      password: body.credentials?.password
    },
    openai
  })

  return run
})
