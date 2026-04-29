import { getRouterParam } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const client = createServiceSupabaseClient(event)

  event.node.res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    'connection': 'keep-alive'
  })

  const send = async () => {
    const { data: run } = await client
      .from('qa_runs')
      .select('id, status, issue_count')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    const { data: steps } = await client
      .from('qa_steps')
      .select('step_number')
      .eq('run_id', id)
      .eq('user_id', user.id)

    event.node.res.write(`data: ${JSON.stringify({ run, step_count: steps?.length || 0 })}\n\n`)

    if (run && ['completed', 'blocked', 'failed', 'cancelled'].includes(run.status)) {
      clearInterval(interval)
      event.node.res.end()
    }
  }

  const interval = setInterval(send, 2000)
  event.node.req.on('close', () => clearInterval(interval))
  await send()
})
