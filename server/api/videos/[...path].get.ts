import { createError, getRouterParam, sendRedirect } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const pathParam = getRouterParam(event, 'path')
  const path = Array.isArray(pathParam) ? pathParam.join('/') : pathParam

  if (!path || !/^[0-9a-f-]+\/[0-9a-f-]+\/run\.webm$/i.test(path)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid video path' })
  }

  const [runId] = path.split('/')
  const client = createServiceSupabaseClient(event)

  const { data: run } = await client
    .from('qa_runs')
    .select('id')
    .eq('id', runId)
    .eq('user_id', user.id)
    .single()

  if (!run) {
    throw createError({ statusCode: 404, statusMessage: 'Video not found' })
  }

  const config = useRuntimeConfig(event)
  const bucket = config.screenshotBucket || process.env.SCREENSHOT_BUCKET || 'qa-screenshots'
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, 600)

  if (error || !data?.signedUrl) {
    throw createError({ statusCode: 404, statusMessage: 'Video not found' })
  }

  return sendRedirect(event, data.signedUrl, 302)
})
