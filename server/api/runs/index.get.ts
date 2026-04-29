import { createError } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const client = createServiceSupabaseClient(event)

  const { data, error } = await client
    .from('qa_runs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data
})
