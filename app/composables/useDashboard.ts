import { createSharedComposable } from '@vueuse/core'

const _useDashboard = () => {
  const router = useRouter()

  defineShortcuts({
    'g-h': () => router.push('/'),
    'g-s': () => router.push('/sites'),
    'g-r': () => router.push('/runs'),
    'n': () => router.push('/runs/new')
  })

  return {}
}

export const useDashboard = createSharedComposable(_useDashboard)
