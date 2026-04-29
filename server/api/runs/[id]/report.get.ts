import { createError, getRouterParam, setHeader } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const client = createServiceSupabaseClient(event)

  const { data: run, error } = await client
    .from('qa_runs')
    .select('report_md')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !run) {
    throw createError({ statusCode: 404, statusMessage: 'Run not found' })
  }

  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  return run.report_md || '# Ghost Customer QA Report\n\nThe report is not ready yet.\n'
})
