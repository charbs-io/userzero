import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerError } from '../lib/errors'

export type RepositoryIndexJob = {
  id: string
  site_id: string
  user_id: string
  attempts: number
  max_attempts: number
}

export async function enqueueGithubRepositoryIndex(client: SupabaseClient, userId: string, siteId: string) {
  const { data, error } = await client.rpc('enqueue_repository_index_job', {
    p_site_id: siteId,
    p_user_id: userId
  })

  if (error || !data) {
    throw createServerError(500, error?.message || 'Could not queue repository indexing')
  }

  return data as string
}

export async function claimNextGithubRepositoryIndexJob(client: SupabaseClient, workerId: string, lockTimeoutSeconds: number) {
  const { data, error } = await client
    .rpc('claim_repository_index_job', {
      p_worker_id: workerId,
      p_lock_timeout_seconds: lockTimeoutSeconds
    })
    .maybeSingle()

  if (error) {
    throw createServerError(500, error.message)
  }

  return data as RepositoryIndexJob | null
}

export async function heartbeatGithubRepositoryIndexJob(client: SupabaseClient, jobId: string, workerId: string) {
  const now = new Date().toISOString()

  await client
    .from('repository_index_jobs')
    .update({
      heartbeat_at: now,
      updated_at: now
    })
    .eq('id', jobId)
    .eq('status', 'running')
    .eq('locked_by', workerId)
}

export async function completeGithubRepositoryIndexJob(client: SupabaseClient, job: RepositoryIndexJob, workerId: string) {
  const now = new Date().toISOString()
  await client
    .from('repository_index_jobs')
    .update({
      status: 'succeeded',
      finished_at: now,
      heartbeat_at: now,
      updated_at: now
    })
    .eq('id', job.id)
    .eq('status', 'running')
    .eq('locked_by', workerId)
}

export async function cancelGithubRepositoryIndexJob(client: SupabaseClient, job: RepositoryIndexJob, workerId: string, reason: string) {
  const now = new Date().toISOString()
  await client
    .from('repository_index_jobs')
    .update({
      status: 'cancelled',
      finished_at: now,
      error: reason,
      heartbeat_at: now,
      updated_at: now
    })
    .eq('id', job.id)
    .eq('status', 'running')
    .eq('locked_by', workerId)
}

export async function failGithubRepositoryIndexJob(client: SupabaseClient, job: RepositoryIndexJob, workerId: string, error: unknown) {
  const now = new Date().toISOString()
  const message = getErrorMessage(error)
  const finalAttempt = job.attempts >= job.max_attempts

  const { data } = await client
    .from('repository_index_jobs')
    .update({
      status: finalAttempt ? 'failed' : 'queued',
      locked_by: null,
      locked_at: null,
      heartbeat_at: null,
      finished_at: finalAttempt ? now : null,
      error: message,
      updated_at: now
    })
    .eq('id', job.id)
    .eq('status', 'running')
    .eq('locked_by', workerId)
    .select('id')
    .maybeSingle()

  if (!data) {
    return
  }

  await client
    .from('site_github_connections')
    .update({
      repository_index_status: finalAttempt ? 'failed' : 'indexing',
      repository_index_error: message,
      updated_at: now
    })
    .eq('site_id', job.site_id)
    .eq('user_id', job.user_id)
    .eq('repository_index_job_id', job.id)
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Repository indexing failed'
}
