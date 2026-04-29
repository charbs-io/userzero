import { createError, getRouterParam } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../utils/supabase'
import { findVerificationToken } from '../../../utils/domain-verification'
import { hashToken } from '../../../utils/security'
import { getUserSiteForVerification } from '../../../utils/sites'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id') || ''
  const client = createServiceSupabaseClient(event)
  const site = await getUserSiteForVerification(client, user.id, id)
  const verification = await findVerificationToken({
    baseUrl: site.base_url,
    hostname: site.hostname
  })
  const now = new Date().toISOString()

  if (!verification || hashToken(verification.token) !== site.token_hash) {
    await client
      .from('sites')
      .update({ last_checked_at: now, updated_at: now })
      .eq('id', site.id)
      .eq('user_id', user.id)

    throw createError({
      statusCode: 400,
      statusMessage: 'Verification token was not found in the site meta tag or DNS TXT record'
    })
  }

  const { data, error } = await client
    .from('sites')
    .update({
      verification_method: verification.method,
      verified_at: now,
      last_checked_at: now,
      updated_at: now
    })
    .eq('id', site.id)
    .eq('user_id', user.id)
    .select('id, user_id, base_url, hostname, verification_method, verified_at, last_checked_at, created_at, updated_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    ...data,
    github_connection: null
  }
})
