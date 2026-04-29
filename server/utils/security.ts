import { lookup } from 'node:dns/promises'
import { createHash, randomBytes } from 'node:crypto'
import { isIP } from 'node:net'
import { domainToASCII } from 'node:url'
import { createError } from 'h3'

const blockedHostnames = new Set(['localhost', 'localhost.localdomain'])

export function generateVerificationToken() {
  return `uzv_${randomBytes(24).toString('base64url')}`
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function normalizeSiteUrl(input: string) {
  const trimmed = input.trim()
  if (!trimmed) {
    throw createError({ statusCode: 400, statusMessage: 'Site URL is required' })
  }

  let parsed: URL

  try {
    parsed = new URL(trimmed)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid site URL including http:// or https://' })
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw createError({ statusCode: 400, statusMessage: 'Site URL must start with http:// or https://' })
  }

  const hostname = domainToASCII(parsed.hostname.toLowerCase()).replace(/\.$/, '')
  if (!hostname || hostname.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid site hostname' })
  }

  if (blockedHostnames.has(hostname) || isIP(hostname)) {
    throw createError({ statusCode: 400, statusMessage: 'Public site ownership is required' })
  }

  parsed.hostname = hostname
  parsed.pathname = '/'
  parsed.search = ''
  parsed.hash = ''

  return {
    baseUrl: parsed.origin,
    hostname
  }
}

export function normalizeTargetUrl(input: string) {
  let parsed: URL

  try {
    parsed = new URL(input.trim())
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid target URL' })
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw createError({ statusCode: 400, statusMessage: 'Only HTTP and HTTPS target URLs are supported' })
  }

  parsed.hash = ''
  return parsed
}

export function isHostnameCovered(targetHostname: string, verifiedHostname: string) {
  return targetHostname === verifiedHostname || targetHostname.endsWith(`.${verifiedHostname}`)
}

export function assertHostnameCovered(targetHostname: string, verifiedHostnames: string[]) {
  const covered = verifiedHostnames.some(hostname => isHostnameCovered(targetHostname, hostname))

  if (!covered) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Target URL is not covered by the verified site'
    })
  }
}

export async function assertPublicHostname(hostname: string) {
  if (blockedHostnames.has(hostname) || (Boolean(isIP(hostname)) && isBlockedIp(hostname))) {
    throw createError({ statusCode: 400, statusMessage: 'Target hostname is not public' })
  }

  const records = await lookup(hostname, { all: true, verbatim: true }).catch(() => [])
  if (!records.length) {
    throw createError({ statusCode: 400, statusMessage: 'Target hostname could not be resolved' })
  }

  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw createError({ statusCode: 400, statusMessage: 'Target hostname resolves to a private or reserved address' })
    }
  }
}

function isBlockedIp(address: string) {
  const version = isIP(address)
  if (version === 4) {
    return isBlockedIpv4(address)
  }

  if (version === 6) {
    const value = address.toLowerCase()
    return value === '::1'
      || value === '::'
      || value.startsWith('fc')
      || value.startsWith('fd')
      || value.startsWith('fe80:')
  }

  return true
}

function isBlockedIpv4(address: string) {
  const parts = address.split('.').map(Number)
  const a = parts[0] ?? 0
  const b = parts[1] ?? 0

  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a >= 224
}
