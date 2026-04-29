import { createError, getRouterParam } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../utils/supabase'
import { findVerificationToken } from '../../../utils/domain-verification'
import { hashToken } from '../../../utils/security'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const client = createServiceSupabaseClient(event)

  const { data: domain, error } = await client
    .from('verified_domains')
    .select('id, hostname, token_hash')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !domain) {
    throw createError({ statusCode: 404, statusMessage: 'Domain not found' })
  }

  const verification = await findVerificationToken(domain.hostname)
  const now = new Date().toISOString()

  if (!verification || hashToken(verification.token) !== domain.token_hash) {
    await client
      .from('verified_domains')
      .update({ last_checked_at: now })
      .eq('id', domain.id)
      .eq('user_id', user.id)

    throw createError({
      statusCode: 400,
      statusMessage: 'Verification token was not found in the domain meta tag or TXT record'
    })
  }

  const { data, error: updateError } = await client
    .from('verified_domains')
    .update({
      verification_method: verification.method,
      verified_at: now,
      last_checked_at: now
    })
    .eq('id', domain.id)
    .eq('user_id', user.id)
    .select('id, hostname, verification_method, verified_at, last_checked_at, created_at')
    .single()

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message })
  }

  return data
})
