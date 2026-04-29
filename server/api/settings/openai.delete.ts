import { createServiceSupabaseClient, requireUser } from '../../utils/supabase'
import { clearUserOpenAIKey } from '../../utils/openai-settings'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const client = createServiceSupabaseClient(event)

  return await clearUserOpenAIKey(client, user.id)
})
