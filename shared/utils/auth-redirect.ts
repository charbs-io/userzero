export const DEFAULT_AUTH_REDIRECT = '/app'

export function getSafeAuthRedirect(value: unknown): string | null
export function getSafeAuthRedirect(value: unknown, fallback: string): string
export function getSafeAuthRedirect(value: unknown, fallback: string | null = null) {
  const candidate = Array.isArray(value) ? value[0] : value

  if (typeof candidate !== 'string'
    || !candidate.startsWith('/')
    || candidate.startsWith('//')
    || candidate === '/login'
    || candidate.startsWith('/auth/callback')) {
    return fallback
  }

  return candidate
}

export function getLoginPath(path: string) {
  return `/login?next=${encodeURIComponent(path)}`
}
