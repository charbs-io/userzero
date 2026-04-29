import { resolveTxt } from 'node:dns/promises'
import { assertHostnameCovered, assertPublicHostname } from './security'

const metaName = 'userzero-site-verification'

export async function findVerificationToken(input: { baseUrl: string, hostname: string }) {
  const [metaToken, txtToken] = await Promise.all([
    findMetaToken(input.baseUrl, input.hostname).catch(() => null),
    findTxtToken(input.hostname).catch(() => null)
  ])

  if (metaToken) {
    return { method: 'meta' as const, token: metaToken }
  }

  if (txtToken) {
    return { method: 'txt' as const, token: txtToken }
  }

  return null
}

async function findMetaToken(baseUrl: string, hostname: string) {
  const response = await fetchSiteHome(baseUrl, hostname)

  if (!response.ok) {
    return null
  }

  const html = await response.text()
  const metaTags = html.match(/<meta\s+[^>]*>/gi) || []

  for (const tag of metaTags) {
    const name = readAttribute(tag, 'name')
    if (name !== metaName) {
      continue
    }

    const content = readAttribute(tag, 'content')
    if (content) {
      return content
    }
  }

  return null
}

async function fetchSiteHome(baseUrl: string, hostname: string) {
  let current = new URL(baseUrl)
  current.pathname = '/'
  current.search = ''
  current.hash = ''

  for (let redirectCount = 0; redirectCount < 6; redirectCount++) {
    assertHostnameCovered(current.hostname, [hostname])
    await assertPublicHostname(current.hostname)

    const response = await fetch(current.toString(), {
      signal: AbortSignal.timeout(10000),
      redirect: 'manual'
    })

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) {
        return response
      }

      const next = new URL(location, current)
      if (!['http:', 'https:'].includes(next.protocol)) {
        return response
      }

      current = next
      continue
    }

    return response
  }

  assertHostnameCovered(current.hostname, [hostname])
  await assertPublicHostname(current.hostname)

  return fetch(current.toString(), {
    signal: AbortSignal.timeout(10000),
    redirect: 'manual'
  })
}

async function findTxtToken(hostname: string) {
  const records = await resolveTxt(`_userzero.${hostname}`)
  const flattened = records.map(record => record.join(''))
  const prefix = `${metaName}=`
  const match = flattened.find(value => value.startsWith(prefix))

  return match ? match.slice(prefix.length) : null
}

function readAttribute(tag: string, attribute: string) {
  const pattern = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'i')
  return tag.match(pattern)?.[1] || null
}
