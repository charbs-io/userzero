import { getQuery, sendRedirect } from 'h3'
import { requireUser } from '../../../utils/supabase'
import { verifyGithubSetupState } from '../../../utils/github-app'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const state = typeof query.state === 'string' ? query.state : ''
  const installationId = typeof query.installation_id === 'string' ? query.installation_id : ''

  if (!state || !installationId) {
    return sendRedirect(event, '/app/sites?github_error=missing_setup_data', 302)
  }

  const payload = verifyGithubSetupState(event, state)
  const user = await requireUser(event)

  if (user.id !== payload.userId) {
    return sendRedirect(event, '/app/sites?github_error=invalid_user', 302)
  }

  return sendRedirect(event, `/app/sites/${payload.siteId}/github?installation_id=${encodeURIComponent(installationId)}`, 302)
})
