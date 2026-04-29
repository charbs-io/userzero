import OpenAI from 'openai'
import { createError, getRouterParam } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../utils/supabase'
import { getUserSite } from '../../../utils/sites'
import { loadUserOpenAIConfig } from '../../../utils/openai-settings'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id') || ''
  const client = createServiceSupabaseClient(event)

  await getUserSite(client, user.id, id)

  const { data: connection, error: connectionError } = await client
    .from('site_github_connections')
    .select('repository_vector_store_id')
    .eq('site_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (connectionError) {
    throw createError({ statusCode: 500, statusMessage: connectionError.message })
  }

  const { error } = await client
    .from('sites')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const vectorStoreId = (connection as { repository_vector_store_id?: string | null } | null)?.repository_vector_store_id
  if (vectorStoreId) {
    const openaiConfig = await loadUserOpenAIConfig(client, user.id, event).catch(() => null)
    if (openaiConfig) {
      await new OpenAI({ apiKey: openaiConfig.apiKey }).vectorStores.delete(vectorStoreId).catch(() => undefined)
    }
  }

  return { ok: true }
})
