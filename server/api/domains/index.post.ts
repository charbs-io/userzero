import { z } from 'zod'
import { createError, readValidatedBody } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../utils/supabase'
import { generateVerificationToken, hashToken, normalizeHostname } from '../../utils/security'

const schema = z.object({
  hostname: z.string().min(1)
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, schema.parse)
  const hostname = normalizeHostname(body.hostname)
  const token = generateVerificationToken()
  const client = createServiceSupabaseClient(event)

  const { data, error } = await client
    .from('verified_domains')
    .insert({
      user_id: user.id,
      hostname,
      token_hash: hashToken(token)
    })
    .select('id, hostname, verification_method, verified_at, last_checked_at, created_at')
    .single()

  if (error) {
    throw createError({
      statusCode: error.code === '23505' ? 409 : 500,
      statusMessage: error.code === '23505' ? 'Domain already exists for this account' : error.message
    })
  }

  return {
    domain: data,
    verification_token: token
  }
})
