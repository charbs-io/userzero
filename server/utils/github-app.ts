import { createHmac, createSign, timingSafeEqual } from 'node:crypto'
import { createError, type H3Event } from 'h3'

const githubApiBase = 'https://api.github.com'
const githubApiVersion = '2026-03-10'

type GithubStatePayload = {
  userId: string
  siteId: string
  expiresAt: number
}

type InstallationTokenResponse = {
  token: string
  expires_at: string
  permissions: Record<string, string>
}

export type GithubRepository = {
  id: number
  name: string
  full_name: string
  html_url: string
  default_branch: string
  owner: {
    login: string
  }
  permissions?: Record<string, boolean>
}

export function getGithubAppSlug(event?: H3Event) {
  const config = event ? useRuntimeConfig(event) : useRuntimeConfig()
  return config.githubAppSlug || process.env.GITHUB_APP_SLUG || ''
}

export function signGithubSetupState(event: H3Event, payload: Omit<GithubStatePayload, 'expiresAt'>) {
  const fullPayload: GithubStatePayload = {
    ...payload,
    expiresAt: Date.now() + 10 * 60 * 1000
  }
  const encoded = base64UrlEncode(JSON.stringify(fullPayload))
  const signature = signState(event, encoded)

  return `${encoded}.${signature}`
}

export function verifyGithubSetupState(event: H3Event, state: string) {
  const [encoded, signature] = state.split('.')
  if (!encoded || !signature) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid GitHub setup state' })
  }

  const expected = signState(event, encoded)
  if (!safeEqual(signature, expected)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid GitHub setup state' })
  }

  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as GithubStatePayload
  if (payload.expiresAt < Date.now()) {
    throw createError({ statusCode: 400, statusMessage: 'GitHub setup state expired' })
  }

  return payload
}

export function verifyGithubWebhookSignature(event: H3Event, body: string, signatureHeader: string | undefined) {
  const secret = getGithubWebhookSecret(event)
  if (!secret || !signatureHeader?.startsWith('sha256=')) {
    return false
  }

  const signature = signatureHeader.slice('sha256='.length)
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  return safeEqual(signature, expected)
}

export async function createInstallationAccessToken(event: H3Event | undefined, installationId: number, options?: {
  repositoryIds?: number[]
  permissions?: Record<string, 'read' | 'write'>
}) {
  const response = await githubAppRequest<InstallationTokenResponse>(event, `/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    body: JSON.stringify({
      repository_ids: options?.repositoryIds,
      permissions: options?.permissions
    })
  })

  return response
}

export async function githubInstallationRequest<T>(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${githubApiBase}${path}`, {
    ...init,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': githubApiVersion,
      ...init.headers
    }
  })

  if (!response.ok) {
    const message = await readGithubError(response)
    throw createError({ statusCode: response.status, statusMessage: message })
  }

  if (response.status === 204) {
    return null as T
  }

  return await response.json() as T
}

async function githubAppRequest<T>(event: H3Event | undefined, path: string, init: RequestInit = {}) {
  const jwt = createGithubAppJwt(event)
  const response = await fetch(`${githubApiBase}${path}`, {
    ...init,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': githubApiVersion,
      ...init.headers
    }
  })

  if (!response.ok) {
    const message = await readGithubError(response)
    throw createError({ statusCode: response.status, statusMessage: message })
  }

  return await response.json() as T
}

function createGithubAppJwt(event?: H3Event) {
  const config = event ? useRuntimeConfig(event) : useRuntimeConfig()
  const appId = config.githubAppId || process.env.GITHUB_APP_ID
  const privateKey = normalizePrivateKey(config.githubAppPrivateKey || process.env.GITHUB_APP_PRIVATE_KEY)

  if (!appId || !privateKey) {
    throw createError({ statusCode: 500, statusMessage: 'GitHub App is not configured' })
  }

  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64UrlEncode(JSON.stringify({
    iat: now - 60,
    exp: now + 9 * 60,
    iss: appId
  }))
  const unsigned = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()

  return `${unsigned}.${signer.sign(privateKey, 'base64url')}`
}

function signState(event: H3Event, encodedPayload: string) {
  const secret = getGithubStateSecret(event)
  if (!secret) {
    throw createError({ statusCode: 500, statusMessage: 'GitHub App state secret is not configured' })
  }

  return createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

function getGithubWebhookSecret(event: H3Event) {
  const config = useRuntimeConfig(event)
  return config.githubAppWebhookSecret || process.env.GITHUB_APP_WEBHOOK_SECRET || ''
}

function getGithubStateSecret(event: H3Event) {
  const config = useRuntimeConfig(event)
  return config.githubAppWebhookSecret
    || config.supabaseServiceRoleKey
    || process.env.GITHUB_APP_WEBHOOK_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || ''
}

function normalizePrivateKey(value?: string) {
  return value?.replace(/\\n/g, '\n') || ''
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString('base64url')
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

async function readGithubError(response: Response) {
  const fallback = `GitHub request failed with ${response.status}`

  try {
    const body = await response.json() as { message?: string }
    return body.message || fallback
  } catch {
    return fallback
  }
}
