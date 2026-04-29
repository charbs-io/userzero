import { z } from 'zod'
import { getQuery, getRouterParam } from 'h3'
import { createServiceSupabaseClient, requireUser } from '../../../../utils/supabase'
import { createInstallationAccessToken, githubInstallationRequest, type GithubRepository } from '../../../../utils/github-app'
import { getUserSite } from '../../../../utils/sites'

const querySchema = z.object({
  installationId: z.coerce.number().int().positive()
})

type RepositoriesResponse = {
  repositories: GithubRepository[]
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id') || ''
  const query = querySchema.parse(getQuery(event))
  const client = createServiceSupabaseClient(event)
  await getUserSite(client, user.id, id)

  const token = await createInstallationAccessToken(event, query.installationId, {
    permissions: {
      contents: 'read',
      metadata: 'read'
    }
  })
  const response = await githubInstallationRequest<RepositoriesResponse>(token.token, '/installation/repositories?per_page=100')

  return response.repositories.map(repository => ({
    id: repository.id,
    name: repository.name,
    full_name: repository.full_name,
    owner: repository.owner.login,
    html_url: repository.html_url,
    default_branch: repository.default_branch,
    permissions: repository.permissions || {}
  }))
})
