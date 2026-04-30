import { randomUUID } from 'node:crypto'
import {
  cancelGithubRepositoryIndexJob,
  claimNextGithubRepositoryIndexJob,
  completeGithubRepositoryIndexJob,
  failGithubRepositoryIndexJob,
  heartbeatGithubRepositoryIndexJob,
  type RepositoryIndexJob
} from '../../server/utils/github-index-jobs'
import { indexGithubRepository } from '../../server/utils/github-index'
import { createServiceSupabaseClient } from '../../server/lib/service-supabase'

const workerId = [
  process.env.RAILWAY_SERVICE_ID || 'local',
  process.env.RAILWAY_DEPLOYMENT_ID || 'dev',
  process.pid,
  randomUUID()
].join(':')
const pollIntervalMs = readPositiveInt(process.env.INDEX_WORKER_POLL_INTERVAL_MS, 5000)
const heartbeatIntervalMs = readPositiveInt(process.env.INDEX_WORKER_HEARTBEAT_INTERVAL_MS, 15000)
const lockTimeoutSeconds = readPositiveInt(process.env.INDEX_WORKER_LOCK_TIMEOUT_SECONDS, 900)
let shuttingDown = false

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

await main()

async function main() {
  const client = createServiceSupabaseClient()
  console.info('Repository index worker started', { workerId, pollIntervalMs, heartbeatIntervalMs, lockTimeoutSeconds })

  while (!shuttingDown) {
    const job = await claimNextGithubRepositoryIndexJob(client, workerId, lockTimeoutSeconds).catch((error) => {
      console.error('Repository index job claim failed', { error: getErrorMessage(error) })
      return null
    })

    if (!job) {
      await sleep(pollIntervalMs)
      continue
    }

    await processJob(job)
  }

  console.info('Repository index worker stopped', { workerId })
}

async function processJob(job: RepositoryIndexJob) {
  const client = createServiceSupabaseClient()
  const heartbeat = setInterval(() => {
    void heartbeatGithubRepositoryIndexJob(client, job.id, workerId).catch((error) => {
      console.warn('Repository index heartbeat failed', { jobId: job.id, error: getErrorMessage(error) })
    })
  }, heartbeatIntervalMs)
  heartbeat.unref()

  try {
    console.info('Repository index job started', {
      jobId: job.id,
      siteId: job.site_id,
      attempt: job.attempts,
      maxAttempts: job.max_attempts
    })

    const result = await indexGithubRepository({
      siteId: job.site_id,
      userId: job.user_id,
      jobId: job.id
    })

    clearInterval(heartbeat)

    if (result.stale) {
      await cancelGithubRepositoryIndexJob(client, job, workerId, 'Superseded by a newer repository index request')
      console.info('Repository index job skipped after being superseded', { jobId: job.id })
      return
    }

    await completeGithubRepositoryIndexJob(client, job, workerId)
    console.info('Repository index job completed', {
      jobId: job.id,
      vectorStoreId: result.vector_store_id,
      fileCount: result.file_count
    })
  } catch (error) {
    clearInterval(heartbeat)
    await failGithubRepositoryIndexJob(client, job, workerId, error)
    console.error('Repository index job failed', {
      jobId: job.id,
      attempt: job.attempts,
      maxAttempts: job.max_attempts,
      error: getErrorMessage(error)
    })
  }
}

function stop() {
  shuttingDown = true
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}
