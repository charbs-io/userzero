import { createError, getRouterParam } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
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

  const { data: steps, error: stepsError } = await client
    .from('qa_steps')
    .select('*')
    .eq('run_id', id)
    .eq('user_id', user.id)
    .order('step_number', { ascending: true })

  if (stepsError) {
    throw createError({ statusCode: 500, statusMessage: stepsError.message })
  }

  const { data: issues, error: issuesError } = await client
    .from('qa_issues')
    .select('*')
    .eq('run_id', id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (issuesError) {
    throw createError({ statusCode: 500, statusMessage: issuesError.message })
  }

  return {
    run: withVideoUrl(run),
    steps: (steps || []).map(step => withScreenshotUrl(step)),
    issues: (issues || []).map(issue => withScreenshotUrl(issue))
  }
})

function withVideoUrl<T extends { video_path: string | null }>(row: T) {
  return {
    ...row,
    video_url: row.video_path ? `/api/videos/${row.video_path}` : null
  }
}

function withScreenshotUrl<T extends { screenshot_path: string | null }>(row: T) {
  return {
    ...row,
    screenshot_url: row.screenshot_path ? `/api/screenshots/${row.screenshot_path}` : null
  }
}
