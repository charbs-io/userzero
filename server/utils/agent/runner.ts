import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Locator, type Page, type Video } from 'playwright'
import { createError } from 'h3'
import { createServiceSupabaseClient } from '../supabase'
import { assertHostnameCovered, assertPublicHostname, normalizeTargetUrl } from '../security'
import { generateMarkdownReport } from '../report'
import { decideNextAction } from './openai'
import type { AgentDecision, ElementInventoryItem } from '../agent-types'
import type { GithubRepositoryContext } from '../github-context'

type RunCredentials = {
  email: string
  username: string
  password: string
}

type RunCredentialInput = {
  username?: string
  password?: string
}

type StartRunInput = {
  runId: string
  userId: string
  targetUrl: string
  persona: string
  goal: string
  maxSteps: number
  verifiedHostnames: string[]
  credentials: RunCredentialInput
  githubContext?: GithubRepositoryContext | null
  repositoryVectorStoreId?: string | null
  openai: {
    apiKey: string
    model: string
  }
}

type ActiveRun = {
  promise: Promise<void>
  controller: AbortController
}

const activeRuns = new Map<string, ActiveRun>()
const INITIAL_CURSOR_POSITION = { x: 72, y: 72 }
const CURSOR_MOVE_DURATION_MS = 340
const CURSOR_TARGET_TIMEOUT_MS = 3000
const VISIBLE_CURSOR_ID = 'productwarden-visible-cursor'

type CursorPoint = {
  x: number
  y: number
}

export function startQaRun(input: StartRunInput) {
  if (activeRuns.has(input.runId)) {
    return
  }

  const controller = new AbortController()
  const promise = runQa(input, controller.signal)
    .catch(async (error) => {
      const client = createServiceSupabaseClient()
      if (await isRunCancelled(client, input)) {
        return
      }

      await client
        .from('qa_runs')
        .update({
          status: 'failed',
          error: error?.message || 'Run failed',
          completed_at: new Date().toISOString()
        })
        .eq('id', input.runId)
        .eq('user_id', input.userId)
        .in('status', ['queued', 'running'])
    })
    .finally(() => {
      activeRuns.delete(input.runId)
    })

  activeRuns.set(input.runId, { promise, controller })
}

export function cancelQaRun(runId: string) {
  const activeRun = activeRuns.get(runId)
  activeRun?.controller.abort()
  return Boolean(activeRun)
}

async function runQa(input: StartRunInput, signal: AbortSignal) {
  const client = createServiceSupabaseClient()
  const openai = input.openai
  const target = normalizeTargetUrl(input.targetUrl)
  const credentials = createRunCredentials(input.runId, input.credentials)
  assertHostnameCovered(target.hostname, input.verifiedHostnames)
  await assertPublicHostname(target.hostname)

  const { data: startedRuns, error: startError } = await client
    .from('qa_runs')
    .update({ status: 'running', started_at: new Date().toISOString(), error: null })
    .eq('id', input.runId)
    .eq('user_id', input.userId)
    .in('status', ['queued', 'running'])
    .select('id')

  if (startError) {
    throw createError({ statusCode: 500, statusMessage: startError.message })
  }

  if (!startedRuns?.length || await shouldStopRun(client, input, signal)) {
    return
  }

  const browser = await chromium.launch({
    headless: true
  })

  const videoDir = await mkdtemp(join(tmpdir(), 'productwarden-video-'))
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    ignoreHTTPSErrors: false,
    permissions: [],
    recordVideo: {
      dir: videoDir,
      size: { width: 960, height: 640 }
    }
  })

  const page = await context.newPage()
  const video = page.video()
  const history: Array<{
    step: number
    observation: string
    action: Record<string, unknown>
    result: Record<string, unknown>
  }> = []
  let finalStatus: 'completed' | 'blocked' = 'blocked'
  let videoPath: string | null = null
  let cursorPosition: CursorPoint = INITIAL_CURSOR_POSITION

  try {
    await page.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 })

    for (let stepNumber = 1; stepNumber <= input.maxSteps; stepNumber++) {
      if (await shouldStopRun(client, input, signal)) {
        return
      }

      const currentUrl = new URL(page.url())
      assertHostnameCovered(currentUrl.hostname, input.verifiedHostnames)
      await assertPublicHostname(currentUrl.hostname)

      const elements = await collectElementInventory(page)
      await ensureVisibleCursor(page, cursorPosition)
      const screenshot = await page.screenshot({ type: 'png', fullPage: false })
      const screenshotPath = await uploadScreenshot(client, input.runId, stepNumber, screenshot)

      if (await shouldStopRun(client, input, signal)) {
        return
      }

      const decision = await decideNextAction({
        persona: input.persona,
        goal: input.goal,
        currentUrl: page.url(),
        stepNumber,
        history,
        elements,
        screenshot,
        credentialFields: credentialFields(),
        githubContext: input.githubContext,
        repositoryVectorStoreId: input.repositoryVectorStoreId,
        openai
      })

      if (await shouldStopRun(client, input, signal)) {
        return
      }

      const actionExecution = await executeAction(page, decision, credentials, cursorPosition)
      cursorPosition = actionExecution.cursorPosition

      if (await shouldStopRun(client, input, signal)) {
        return
      }

      await insertStep(client, {
        runId: input.runId,
        userId: input.userId,
        stepNumber,
        url: page.url(),
        screenshotPath,
        decision,
        actionResult: actionExecution.result
      })

      await insertIssues(client, {
        runId: input.runId,
        userId: input.userId,
        stepNumber,
        screenshotPath,
        decision
      })

      history.push({
        step: stepNumber,
        observation: decision.observation,
        action: sanitizeAction(decision.next_action),
        result: actionExecution.result
      })

      if (decision.goal_status === 'completed' || decision.next_action.type === 'stop') {
        finalStatus = decision.goal_status === 'completed' ? 'completed' : 'blocked'
        break
      }

      if (decision.goal_status === 'blocked') {
        finalStatus = 'blocked'
        break
      }
    }
  } finally {
    await context.close().catch(() => undefined)
    videoPath = await uploadRunVideo(client, input.runId, video).catch(() => null)
    if (videoPath) {
      await saveRunVideoPath(client, input.runId, input.userId, videoPath).catch(() => undefined)
    }
    await browser.close()
    await rm(videoDir, { recursive: true, force: true }).catch(() => undefined)
  }

  if (await shouldStopRun(client, input, signal)) {
    return
  }

  const { data: run } = await client
    .from('qa_runs')
    .select('*')
    .eq('id', input.runId)
    .eq('user_id', input.userId)
    .single()

  const { data: steps } = await client
    .from('qa_steps')
    .select('*')
    .eq('run_id', input.runId)
    .eq('user_id', input.userId)
    .order('step_number', { ascending: true })

  const { data: issues } = await client
    .from('qa_issues')
    .select('*')
    .eq('run_id', input.runId)
    .eq('user_id', input.userId)
    .order('created_at', { ascending: true })

  if (!run) {
    throw createError({ statusCode: 500, statusMessage: 'Run disappeared during execution' })
  }

  const report = generateMarkdownReport(run, steps || [], issues || [])

  await client
    .from('qa_runs')
    .update({
      status: finalStatus === 'completed' ? 'completed' : 'blocked',
      result: finalStatus,
      issue_count: issues?.length || 0,
      video_path: videoPath,
      report_md: report,
      completed_at: new Date().toISOString()
    })
    .eq('id', input.runId)
    .eq('user_id', input.userId)
    .eq('status', 'running')
}

async function shouldStopRun(client: ReturnType<typeof createServiceSupabaseClient>, input: StartRunInput, signal: AbortSignal) {
  return signal.aborted || await isRunCancelled(client, input)
}

async function isRunCancelled(client: ReturnType<typeof createServiceSupabaseClient>, input: StartRunInput) {
  const { data } = await client
    .from('qa_runs')
    .select('status')
    .eq('id', input.runId)
    .eq('user_id', input.userId)
    .single()

  return data?.status === 'cancelled'
}

async function collectElementInventory(page: Page): Promise<ElementInventoryItem[]> {
  return await page.evaluate(() => {
    type BrowserRect = { x: number, y: number, width: number, height: number }
    type BrowserStyle = { visibility: string, display: string }
    type BrowserElement = {
      id?: string
      tagName: string
      innerText?: string
      href?: string
      getBoundingClientRect: () => BrowserRect
      getAttribute: (name: string) => string | null
      setAttribute: (name: string, value: string) => void
      hasAttribute: (name: string) => boolean
    }
    type BrowserLabel = { innerText: string }
    type BrowserGlobal = {
      document: {
        querySelectorAll: (selector: string) => Iterable<BrowserElement | BrowserLabel>
      }
      window: {
        getComputedStyle: (element: BrowserElement) => BrowserStyle
      }
      CSS: {
        escape: (value: string) => string
      }
    }

    const browserGlobal = globalThis as unknown as BrowserGlobal
    const documentRef = browserGlobal.document
    const windowRef = browserGlobal.window
    const cssRef = browserGlobal.CSS
    const selector = [
      'a[href]',
      'button',
      'input',
      'textarea',
      'select',
      '[role="button"]',
      '[role="link"]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',')

    const elements = Array.from(documentRef.querySelectorAll(selector)) as BrowserElement[]
    let count = 0

    return elements
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const style = windowRef.getComputedStyle(element)
        const visible = rect.width > 0
          && rect.height > 0
          && style.visibility !== 'hidden'
          && style.display !== 'none'

        if (!visible) {
          return null
        }

        count += 1
        const id = `pw-${count}`
        element.setAttribute('data-productwarden-agent-id', id)

        const labels = element.id
          ? (Array.from(documentRef.querySelectorAll(`label[for="${cssRef.escape(element.id)}"]`)) as BrowserLabel[]).map(label => label.innerText.trim())
          : []

        return {
          id,
          role: element.getAttribute('role') || element.tagName.toLowerCase(),
          tag: element.tagName.toLowerCase(),
          text: (element.innerText || element.getAttribute('aria-label') || '').trim().slice(0, 160),
          label: labels.join(' ').slice(0, 160),
          placeholder: (element.getAttribute('placeholder') || '').slice(0, 160),
          href: element.href || '',
          testId: element.getAttribute('data-testid') || '',
          disabled: element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true',
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        }
      })
      .filter(Boolean)
      .slice(0, 120)
  }) as ElementInventoryItem[]
}

async function executeAction(page: Page, decision: AgentDecision, credentials: RunCredentials, cursorPosition: CursorPoint) {
  const action = decision.next_action
  const result: Record<string, unknown> = {
    type: action.type,
    target_id: action.target_id,
    target_description: action.target_description,
    reason: action.reason
  }
  let nextCursorPosition = cursorPosition

  try {
    if (action.type === 'stop') {
      await ensureVisibleCursor(page, nextCursorPosition)
      return { result: { ...result, status: 'stopped' }, cursorPosition: nextCursorPosition }
    }

    if (action.type === 'wait') {
      await ensureVisibleCursor(page, nextCursorPosition)
      await page.waitForTimeout(1200)
      return { result: { ...result, status: 'ok' }, cursorPosition: nextCursorPosition }
    }

    if (action.type === 'scroll') {
      nextCursorPosition = await moveVisibleCursor(page, nextCursorPosition, viewportCenter(page))
      await page.mouse.wheel(0, action.direction === 'up' ? -700 : 700)
      await page.waitForTimeout(500)
      return { result: { ...result, status: 'ok' }, cursorPosition: nextCursorPosition }
    }

    if (action.type === 'navigate') {
      await ensureVisibleCursor(page, nextCursorPosition)
      const nextUrl = new URL(action.url)
      if (!['http:', 'https:'].includes(nextUrl.protocol)) {
        throw new Error('Blocked non-HTTP navigation')
      }
      await page.goto(nextUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 })
      await ensureVisibleCursor(page, nextCursorPosition)
      return { result: { ...result, status: 'ok' }, cursorPosition: nextCursorPosition }
    }

    const locator = action.target_id
      ? page.locator(`[data-productwarden-agent-id="${action.target_id}"]`).first()
      : fallbackLocator(page, action.target_description)

    if (action.type === 'click') {
      const targetPoint = await cursorPointForLocator(page, locator)
      if (targetPoint) {
        nextCursorPosition = await moveVisibleCursor(page, nextCursorPosition, targetPoint)
      }

      await locator.click({ timeout: 8000 })
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => undefined)
      await ensureVisibleCursor(page, nextCursorPosition)
      return { result: { ...result, status: 'ok' }, cursorPosition: nextCursorPosition }
    }

    if (action.type === 'type') {
      const targetPoint = await cursorPointForLocator(page, locator)
      if (targetPoint) {
        nextCursorPosition = await moveVisibleCursor(page, nextCursorPosition, targetPoint)
      }

      const text = await resolveActionText(locator, action, credentials)
      await locator.fill(text.value, { timeout: 8000 })
      return { result: { ...result, status: 'ok', text: text.reportText }, cursorPosition: nextCursorPosition }
    }
  } catch (error: unknown) {
    return {
      result: { ...result, status: 'error', error: error instanceof Error ? error.message : 'Action failed' },
      cursorPosition: nextCursorPosition
    }
  }

  return { result: { ...result, status: 'ignored' }, cursorPosition: nextCursorPosition }
}

async function cursorPointForLocator(page: Page, locator: Locator): Promise<CursorPoint | null> {
  await locator.scrollIntoViewIfNeeded({ timeout: CURSOR_TARGET_TIMEOUT_MS }).catch(() => undefined)

  const box = await locator.boundingBox({ timeout: CURSOR_TARGET_TIMEOUT_MS }).catch(() => null)
  if (!box) {
    return null
  }

  return clampCursorPoint(page, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  })
}

async function moveVisibleCursor(page: Page, from: CursorPoint, to: CursorPoint) {
  const start = clampCursorPoint(page, from)
  const target = clampCursorPoint(page, to)
  await ensureVisibleCursor(page, start)
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await ensureVisibleCursor(page, target)
  await page.waitForTimeout(CURSOR_MOVE_DURATION_MS)

  return target
}

async function ensureVisibleCursor(page: Page, point: CursorPoint) {
  const safePoint = clampCursorPoint(page, point)
  await page.evaluate(({ duration, id, x, y }) => {
    type BrowserCursorElement = {
      id: string
      innerHTML: string
      style: Record<string, string>
      setAttribute: (name: string, value: string) => void
    }
    type BrowserDocument = {
      createElement: (tagName: string) => BrowserCursorElement
      documentElement: {
        appendChild: (element: BrowserCursorElement) => void
      }
      getElementById: (id: string) => BrowserCursorElement | null
    }

    const documentRef = (globalThis as unknown as { document: BrowserDocument }).document
    let cursor = documentRef.getElementById(id)

    if (!cursor) {
      cursor = documentRef.createElement('div')
      cursor.id = id
      cursor.innerHTML = [
        '<svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">',
        '<path d="M3 2L3 24L9.5 18.1L13.2 27.1L17.5 25.3L13.6 16.5H22.8L3 2Z" fill="white" stroke="#111827" stroke-width="2" stroke-linejoin="round"/>',
        '</svg>'
      ].join('')
      cursor.setAttribute('aria-hidden', 'true')
      Object.assign(cursor.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        width: '30px',
        height: '30px',
        zIndex: '2147483647',
        pointerEvents: 'none',
        overflow: 'visible',
        transition: `transform ${duration}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
        filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))'
      })
      documentRef.documentElement.appendChild(cursor)
    }

    cursor.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
  }, {
    duration: CURSOR_MOVE_DURATION_MS,
    id: VISIBLE_CURSOR_ID,
    x: safePoint.x,
    y: safePoint.y
  }).catch(() => undefined)
}

function viewportCenter(page: Page): CursorPoint {
  const viewport = page.viewportSize()
  if (!viewport) {
    return INITIAL_CURSOR_POSITION
  }

  return {
    x: viewport.width / 2,
    y: viewport.height / 2
  }
}

function clampCursorPoint(page: Page, point: CursorPoint): CursorPoint {
  const viewport = page.viewportSize()
  if (!viewport) {
    return {
      x: Math.max(0, Math.round(point.x)),
      y: Math.max(0, Math.round(point.y))
    }
  }

  return {
    x: Math.max(0, Math.min(viewport.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(viewport.height - 1, Math.round(point.y)))
  }
}

function fallbackLocator(page: Page, description: string) {
  return page
    .getByRole('button', { name: new RegExp(escapeRegExp(description), 'i') })
    .or(page.getByRole('link', { name: new RegExp(escapeRegExp(description), 'i') }))
    .or(page.getByLabel(new RegExp(escapeRegExp(description), 'i')))
    .or(page.getByPlaceholder(new RegExp(escapeRegExp(description), 'i')))
    .first()
}

async function uploadScreenshot(client: ReturnType<typeof createServiceSupabaseClient>, runId: string, stepNumber: number, screenshot: Buffer) {
  const config = useRuntimeConfig()
  const bucket = config.screenshotBucket || process.env.SCREENSHOT_BUCKET || 'qa-screenshots'
  const path = `${runId}/step-${String(stepNumber).padStart(3, '0')}.png`
  const { error } = await client.storage.from(bucket).upload(path, screenshot, {
    contentType: 'image/png',
    upsert: true
  })

  if (error) {
    return null
  }

  return path
}

async function uploadRunVideo(client: ReturnType<typeof createServiceSupabaseClient>, runId: string, video: Video | null) {
  if (!video) {
    return null
  }

  const config = useRuntimeConfig()
  const bucket = config.screenshotBucket || process.env.SCREENSHOT_BUCKET || 'qa-screenshots'
  const sourcePath = await video.path()
  const file = await readFile(sourcePath)
  const path = `${runId}/run.webm`
  const { error } = await client.storage.from(bucket).upload(path, file, {
    contentType: 'video/webm',
    upsert: true
  })

  if (error) {
    return null
  }

  return path
}

async function saveRunVideoPath(client: ReturnType<typeof createServiceSupabaseClient>, runId: string, userId: string, videoPath: string) {
  await client
    .from('qa_runs')
    .update({ video_path: videoPath })
    .eq('id', runId)
    .eq('user_id', userId)
}

async function insertStep(client: ReturnType<typeof createServiceSupabaseClient>, input: {
  runId: string
  userId: string
  stepNumber: number
  url: string
  screenshotPath: string | null
  decision: AgentDecision
  actionResult: Record<string, unknown>
}) {
  await client.from('qa_steps').insert({
    run_id: input.runId,
    user_id: input.userId,
    step_number: input.stepNumber,
    url: input.url,
    screenshot_path: input.screenshotPath,
    observation: input.decision.observation,
    progress: input.decision.progress,
    action: sanitizeAction(input.decision.next_action),
    result: input.actionResult
  })
}

async function insertIssues(client: ReturnType<typeof createServiceSupabaseClient>, input: {
  runId: string
  userId: string
  stepNumber: number
  screenshotPath: string | null
  decision: AgentDecision
}) {
  if (!input.decision.possible_issues.length) {
    return
  }

  await client.from('qa_issues').insert(input.decision.possible_issues.map(issue => ({
    run_id: input.runId,
    user_id: input.userId,
    step_number: input.stepNumber,
    category: issue.type,
    severity: issue.severity,
    title: issue.title,
    description: issue.description,
    evidence: issue.evidence,
    suggested_fix: issue.suggested_fix,
    screenshot_path: input.screenshotPath
  })))
}

function credentialFields() {
  return [
    'credential.email',
    'credential.username',
    'credential.password'
  ]
}

type ResolvedActionText = {
  value: string
  reportText: string
}

function substituteCredential(text: string, credentials: RunCredentials): ResolvedActionText | null {
  const placeholder = text.trim()

  if (placeholder === 'credential.email') {
    return { value: credentials.email, reportText: placeholder }
  }

  if (placeholder === 'credential.username') {
    return { value: credentials.username, reportText: placeholder }
  }

  if (placeholder === 'credential.password') {
    return { value: credentials.password, reportText: placeholder }
  }

  return null
}

async function resolveActionText(locator: Locator, action: AgentDecision['next_action'], credentials: RunCredentials): Promise<ResolvedActionText> {
  const substituted = substituteCredential(action.text, credentials)
  if (substituted) {
    return substituted
  }

  if (action.text.trim()) {
    return { value: action.text, reportText: maskIfSecret(action.text) }
  }

  const inferred = await inferBlankActionText(locator, action.target_description, credentials).catch(() => null)
  return inferred || { value: '', reportText: '' }
}

async function inferBlankActionText(locator: Locator, targetDescription: string, credentials: RunCredentials): Promise<ResolvedActionText | null> {
  const elementDescription = await locator.evaluate((element) => {
    type FormControlElement = {
      getAttribute: (name: string) => string | null
      labels?: Iterable<{ textContent: string | null }> | null
    }

    const control = element as unknown as FormControlElement
    const labelText = control.labels
      ? Array.from(control.labels).map(label => label.textContent || '').join(' ')
      : ''

    return [
      control.getAttribute('type'),
      control.getAttribute('autocomplete'),
      control.getAttribute('name'),
      control.getAttribute('id'),
      control.getAttribute('placeholder'),
      control.getAttribute('aria-label'),
      control.getAttribute('data-testid'),
      labelText
    ].filter(Boolean).join(' ')
  }, undefined, { timeout: 1000 })

  const description = `${targetDescription} ${elementDescription}`.toLowerCase()

  if (description.includes('password')) {
    return { value: credentials.password, reportText: 'credential.password' }
  }

  if (description.includes('email') || description.includes('e-mail')) {
    return { value: credentials.email, reportText: 'credential.email' }
  }

  if (description.includes('username') || description.includes('user name')) {
    return { value: credentials.username, reportText: 'credential.username' }
  }

  if (description.includes('playlist')) {
    return { value: 'QA Test Playlist', reportText: 'QA Test Playlist' }
  }

  if (description.includes('workspace') || description.includes('company') || description.includes('team') || description.includes('organization')) {
    return { value: 'Product Warden Test Workspace', reportText: 'Product Warden Test Workspace' }
  }

  if (description.includes('full name') || description.includes('display name') || /\bname\b/.test(description)) {
    return { value: 'Product Warden Test User', reportText: 'Product Warden Test User' }
  }

  return null
}

function createRunCredentials(runId: string, credentials: RunCredentialInput): RunCredentials {
  const suffix = runId.replace(/-/g, '').slice(0, 12)
  const providedUsername = credentials.username?.trim()
  const providedPassword = credentials.password || ''
  const generatedEmail = `productwarden-${suffix}@example.com`
  const email = providedUsername?.includes('@') ? providedUsername : generatedEmail
  const username = providedUsername || email
  const password = providedPassword || `ProductWarden${suffix}A9!`

  return {
    email,
    username,
    password
  }
}

function maskIfSecret(text: string) {
  const placeholder = text.trim()
  return placeholder.startsWith('credential.') ? placeholder : text
}

function sanitizeAction(action: AgentDecision['next_action']) {
  return {
    ...action,
    text: maskIfSecret(action.text)
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
