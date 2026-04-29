import { createSharedComposable } from '@vueuse/core'

const _useDashboard = () => {
  const router = useRouter()

  defineShortcuts({
    'g-h': () => router.push('/'),
    'g-s': () => router.push('/app/sites'),
    'g-r': () => router.push('/app/runs'),
    'n': () => router.push('/app/runs/new')
  })

  return {}
}

export const useDashboard = createSharedComposable(_useDashboard)
