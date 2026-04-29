import { createError, getRouterParam } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../utils/supabase'
import { cancelQaRun } from '../../../utils/agent/runner'

const STOPPABLE_STATUSES = ['queued', 'running']

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing run id' })
  }

  const client = createServiceSupabaseClient(event)

  const { data: run, error } = await client
    .from('qa_runs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !run) {
    throw createError({ statusCode: 404, statusMessage: 'Run not found' })
  }

  if (!STOPPABLE_STATUSES.includes(run.status)) {
    return run
  }

  const { data: stoppedRuns, error: updateError } = await client
    .from('qa_runs')
    .update({
      status: 'cancelled',
      error: null,
      completed_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .in('status', STOPPABLE_STATUSES)
    .select('*')

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message })
  }

  const stoppedRun = stoppedRuns?.[0] || run
  if (stoppedRun.status === 'cancelled') {
    cancelQaRun(id)
  }

  return stoppedRun
})
