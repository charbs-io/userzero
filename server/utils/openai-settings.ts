import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createError } from 'h3'

const CIPHER_ALGORITHM = 'aes-256-gcm'
const CIPHERTEXT_VERSION = 'v1'
const MIN_SECRET_LENGTH = 32

type OpenAISettingsRow = {
  encrypted_openai_api_key: string | null
  openai_api_key_updated_at: string | null
  updated_at: string
}

export async function getOpenAISettingsStatus(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from('user_ai_settings')
    .select('encrypted_openai_api_key, openai_api_key_updated_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const row = data as OpenAISettingsRow | null

  return {
    configured: Boolean(row?.encrypted_openai_api_key),
    updated_at: row?.openai_api_key_updated_at || null
  }
}

export async function saveUserOpenAIKey(client: SupabaseClient, userId: string, apiKey: string, event?: H3Event) {
  const now = new Date().toISOString()
  const encryptedKey = encryptSecret(apiKey, event)

  const { data, error } = await client
    .from('user_ai_settings')
    .upsert({
      user_id: userId,
      encrypted_openai_api_key: encryptedKey,
      openai_api_key_updated_at: now,
      updated_at: now
    }, { onConflict: 'user_id' })
    .select('openai_api_key_updated_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const row = data as { openai_api_key_updated_at: string }

  return {
    configured: true,
    updated_at: row.openai_api_key_updated_at
  }
}

export async function clearUserOpenAIKey(client: SupabaseClient, userId: string) {
  const { error } = await client
    .from('user_ai_settings')
    .delete()
    .eq('user_id', userId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    configured: false,
    updated_at: null
  }
}

export async function loadUserOpenAIConfig(client: SupabaseClient, userId: string, event?: H3Event) {
  const { data, error } = await client
    .from('user_ai_settings')
    .select('encrypted_openai_api_key')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const row = data as { encrypted_openai_api_key: string | null } | null

  if (!row?.encrypted_openai_api_key) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Add your OpenAI API key in Setup before starting a run'
    })
  }

  const apiKey = decryptSecret(row.encrypted_openai_api_key, event)

  return {
    apiKey,
    keyFingerprint: fingerprintOpenAIKey(apiKey, event),
    model: getOpenAIModel(event)
  }
}

export function fingerprintOpenAIKey(apiKey: string, event?: H3Event) {
  return createHmac('sha256', getEncryptionKey(event))
    .update(apiKey)
    .digest('hex')
    .slice(0, 32)
}

function encryptSecret(secret: string, event?: H3Event) {
  const key = getEncryptionKey(event)
  const iv = randomBytes(12)
  const cipher = createCipheriv(CIPHER_ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    CIPHERTEXT_VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64')
  ].join(':')
}

function decryptSecret(encryptedSecret: string, event?: H3Event) {
  const [version, iv, authTag, ciphertext] = encryptedSecret.split(':')

  if (version !== CIPHERTEXT_VERSION || !iv || !authTag || !ciphertext) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Stored OpenAI API key has an unsupported encryption format'
    })
  }

  try {
    const decipher = createDecipheriv(CIPHER_ALGORITHM, getEncryptionKey(event), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(authTag, 'base64'))

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final()
    ]).toString('utf8')
  } catch {
    throw createError({
      statusCode: 500,
      statusMessage: 'Stored OpenAI API key could not be decrypted; re-save it in Setup'
    })
  }
}

function getEncryptionKey(event?: H3Event) {
  const config = event ? useRuntimeConfig(event) : useRuntimeConfig()
  const secret = String(config.apiKeyEncryptionSecret || process.env.API_KEY_ENCRYPTION_SECRET || '')

  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw createError({
      statusCode: 500,
      statusMessage: 'API key encryption is not configured'
    })
  }

  return createHash('sha256').update(secret).digest()
}

function getOpenAIModel(event?: H3Event) {
  const config = event ? useRuntimeConfig(event) : useRuntimeConfig()
  return String(config.openaiModel || process.env.OPENAI_MODEL || 'gpt-5.4-mini')
}
