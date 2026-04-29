import { createError, getHeader, readRawBody } from 'h3'
import { createServiceSupabaseClient } from '../../../utils/supabase'
import { verifyGithubWebhookSignature } from '../../../utils/github-app'

type InstallationPayload = {
  action?: string
  installation?: {
    id?: number
  }
}

type InstallationRepositoriesPayload = InstallationPayload & {
  repositories_removed?: Array<{ id: number }>
}

export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, 'utf8')
  const signature = getHeader(event, 'x-hub-signature-256')

  if (!rawBody || !verifyGithubWebhookSignature(event, rawBody, signature)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid GitHub webhook signature' })
  }

  const eventName = getHeader(event, 'x-github-event')
  const payload = JSON.parse(rawBody) as InstallationRepositoriesPayload
  const installationId = payload.installation?.id

  if (!installationId) {
    return { ok: true }
  }

  const client = createServiceSupabaseClient(event)
  const now = new Date().toISOString()

  if (eventName === 'installation' && payload.action === 'deleted') {
    await client
      .from('site_github_connections')
      .update({ disconnected_at: now, updated_at: now })
      .eq('installation_id', installationId)

    return { ok: true }
  }

  if (eventName === 'installation_repositories' && payload.action === 'removed' && payload.repositories_removed?.length) {
    await client
      .from('site_github_connections')
      .update({ disconnected_at: now, updated_at: now })
      .eq('installation_id', installationId)
      .in('repository_id', payload.repositories_removed.map(repository => repository.id))
  }

  return { ok: true }
})
