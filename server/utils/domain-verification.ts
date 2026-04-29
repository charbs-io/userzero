import { resolveTxt } from 'node:dns/promises'

const metaName = 'userzero-site-verification'

export async function findVerificationToken(hostname: string) {
  const [metaToken, txtToken] = await Promise.all([
    findMetaToken(hostname).catch(() => null),
    findTxtToken(hostname).catch(() => null)
  ])

  if (metaToken) {
    return { method: 'meta' as const, token: metaToken }
  }

  if (txtToken) {
    return { method: 'txt' as const, token: txtToken }
  }

  return null
}

async function findMetaToken(hostname: string) {
  const response = await fetch(`https://${hostname}/`, {
    signal: AbortSignal.timeout(10000),
    redirect: 'follow'
  })

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
