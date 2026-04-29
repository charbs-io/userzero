const publicRoutes = new Set(['/login'])

export default defineNuxtRouteMiddleware(async (to) => {
  if (publicRoutes.has(to.path) || to.path.startsWith('/auth/callback')) {
    return
  }

  const supabase = useSupabaseClient()
  const { data } = await supabase.auth.getSession()

  if (!data.session) {
    return navigateTo('/login')
  }
})
