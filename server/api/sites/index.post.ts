import { z } from 'zod'
import { createError, readValidatedBody } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../utils/supabase'
import { generateVerificationToken, hashToken, normalizeSiteUrl } from '../../utils/security'

const schema = z.object({
  url: z.string().min(1)
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, schema.parse)
  const site = normalizeSiteUrl(body.url)
  const token = generateVerificationToken()
  const client = createServiceSupabaseClient(event)

  const { data, error } = await client
    .from('sites')
    .insert({
      user_id: user.id,
      base_url: site.baseUrl,
      hostname: site.hostname,
      token_hash: hashToken(token)
    })
    .select('id, user_id, base_url, hostname, verification_method, verified_at, last_checked_at, created_at, updated_at')
    .single()

  if (error) {
    throw createError({
      statusCode: error.code === '23505' ? 409 : 500,
      statusMessage: error.code === '23505' ? 'Site already exists for this account' : error.message
    })
  }

  return {
    site: {
      ...data,
      github_connection: null
    },
    verification_token: token
  }
})
