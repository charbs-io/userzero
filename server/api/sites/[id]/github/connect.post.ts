import { createError, getRouterParam } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../../utils/supabase'
import { getGithubAppSlug, signGithubSetupState } from '../../../../utils/github-app'
import { getUserSite } from '../../../../utils/sites'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id') || ''
  const client = createServiceSupabaseClient(event)
  await getUserSite(client, user.id, id)

  const slug = getGithubAppSlug(event)
  if (!slug) {
    throw createError({ statusCode: 500, statusMessage: 'GitHub App slug is not configured' })
  }

  const state = signGithubSetupState(event, {
    userId: user.id,
    siteId: id
  })

  return {
    url: `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(state)}`
  }
})
