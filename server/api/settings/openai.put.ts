import { z } from 'zod'
import { readValidatedBody } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../utils/supabase'
import { saveUserOpenAIKey } from '../../utils/openai-settings'

const schema = z.object({
  apiKey: z.string().trim().min(20).max(500)
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, schema.parse)
  const client = createServiceSupabaseClient(event)

  return await saveUserOpenAIKey(client, user.id, body.apiKey, event)
})
