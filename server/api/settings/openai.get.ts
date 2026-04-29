import { createServiceSupabaseClient, requireUser } from '../../utils/supabase'
import { getOpenAISettingsStatus } from '../../utils/openai-settings'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const client = createServiceSupabaseClient(event)

  return await getOpenAISettingsStatus(client, user.id)
})
