import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Locator, type Page, type Request, type Video } from 'playwright'
import { createError } from 'h3'
import { createServiceSupabaseClient } from '../supabase'
import { assertHostnameCovered, assertPublicHostname, normalizeTargetUrl } from '../security'
import { generateOverarchingMarkdownReport, generatePersonaMarkdownReport } from '../report'
import { decideNextAction } from './openai'
import type { AgentDecision, ElementInventoryItem } from '../agent-types'
import type { GithubRepositoryContext } from '../github-context'

type RunCredentials = {
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
  personas: RunPersonaInput[]
  verifiedHostnames: string[]
  credentials: RunCredentials
  githubContext?: GithubRepositoryContext | null
  repositoryVectorStoreId?: string | null
  openai: {
    apiKey: string
    model: string
  }
}

type RunPersonaInput = {
  id: string
  personaTemplateId: string | null
  position: number
  name: string
  role: string
  responsibilities: string[]
  reportFocus: string[]
  goal: string
}

type RuntimeDiagnostics = {
  page_load_ms: number | null
  dom_content_loaded_ms: number | null
  recent_requests: Array<{
    url: string
    method: string
    resource_type: string
    status: number | null
    duration_ms: number
  }>
  slow_requests: Array<{
    url: string
    method: string
    resource_type: string
    status: number | null
    duration_ms: number
  }>
  console_messages: Array<{
    type: string
    text: string
  }>
  page_errors: string[]
}

type DiagnosticsRecorder = {
  requestStartedAt: Map<Request, number>
  requests: RuntimeDiagnostics['recent_requests']
  consoleMessages: RuntimeDiagnostics['console_messages']
  pageErrors: string[]
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

  for (const persona of input.personas) {
    if (await shouldStopRun(client, input, signal)) {
      await cancelQueuedPersonas(client, input)
      return
    }

    await runPersonaQa({
      client,
      input,
      persona,
      target,
      openai,
      signal
    })
  }

  const { data: run } = await client
    .from('qa_runs')
    .select('*')
    .eq('id', input.runId)
    .eq('user_id', input.userId)
    .single()

  const { data: issues } = await client
    .from('qa_issues')
    .select('*')
    .eq('run_id', input.runId)
    .eq('user_id', input.userId)
    .order('created_at', { ascending: true })

  if (!run) {
    throw createError({ statusCode: 500, statusMessage: 'Run disappeared during execution' })
  }

  const { data: personas } = await client
    .from('qa_run_personas')
    .select('*')
    .eq('run_id', input.runId)
    .eq('user_id', input.userId)
    .order('position', { ascending: true })

  const personaRows = personas || []
  const completedCount = personaRows.filter(persona => persona.status === 'completed').length
  const finalResult = completedCount === personaRows.length
    ? 'completed'
    : completedCount > 0 ? 'partially_completed' : 'blocked'
  const finalStatus = finalResult === 'completed' ? 'completed' : 'blocked'
  const report = generateOverarchingMarkdownReport({
    ...run,
    status: finalStatus,
    result: finalResult
  }, personaRows, issues || [])

  await client
    .from('qa_runs')
    .update({
      status: finalStatus,
      result: finalResult,
      issue_count: issues?.length || 0,
      report_md: report,
      completed_at: new Date().toISOString()
    })
    .eq('id', input.runId)
    .eq('user_id', input.userId)
    .eq('status', 'running')
}

async function runPersonaQa(args: {
  client: ReturnType<typeof createServiceSupabaseClient>
  input: StartRunInput
  persona: RunPersonaInput
  target: URL
  openai: StartRunInput['openai']
  signal: AbortSignal
}) {
  const { client, input, persona, target, openai, signal } = args
  const now = new Date().toISOString()
  const { error: startError } = await client
    .from('qa_run_personas')
    .update({ status: 'running', started_at: now, error: null })
    .eq('id', persona.id)
    .eq('run_id', input.runId)
    .eq('user_id', input.userId)
    .in('status', ['queued', 'running'])

  if (startError) {
    throw createError({ statusCode: 500, statusMessage: startError.message })
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
  const diagnostics = attachDiagnostics(page)
  const video = page.video()
  const history: Array<{ step: number, observation: string, action: Record<string, unknown> }> = []
  let finalStatus: 'completed' | 'blocked' = 'blocked'
  let videoPath: string | null = null
  let cursorPosition: CursorPoint = INITIAL_CURSOR_POSITION

  try {
    await page.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 })

    for (let stepNumber = 1; stepNumber <= input.maxSteps; stepNumber++) {
      if (await shouldStopRun(client, input, signal)) {
        await markPersonaCancelled(client, input, persona)
        return
      }

      const currentUrl = new URL(page.url())
      assertHostnameCovered(currentUrl.hostname, input.verifiedHostnames)
      await assertPublicHostname(currentUrl.hostname)

      const elements = await collectElementInventory(page)
      await ensureVisibleCursor(page, cursorPosition)
      const screenshot = await page.screenshot({ type: 'png', fullPage: false })
      const screenshotPath = await uploadScreenshot(client, input.runId, persona.id, stepNumber, screenshot)
      const runtimeDiagnostics = await readRuntimeDiagnostics(page, diagnostics)

      if (await shouldStopRun(client, input, signal)) {
        await markPersonaCancelled(client, input, persona)
        return
      }

      const decision = await decideNextAction({
        persona: describePersona(persona),
        goal: persona.goal,
        currentUrl: page.url(),
        stepNumber,
        history,
        elements,
        screenshot,
        diagnostics: runtimeDiagnostics,
        credentialFields: credentialFields(input.credentials),
        githubContext: input.githubContext,
        repositoryVectorStoreId: input.repositoryVectorStoreId,
        openai
      })

      if (await shouldStopRun(client, input, signal)) {
        await markPersonaCancelled(client, input, persona)
        return
      }

      const actionExecution = await executeAction(page, decision, input.credentials, cursorPosition)
      cursorPosition = actionExecution.cursorPosition
      const actionResult = {
        ...actionExecution.result,
        diagnostics: runtimeDiagnostics
      }

      if (await shouldStopRun(client, input, signal)) {
        await markPersonaCancelled(client, input, persona)
        return
      }

      await insertStep(client, {
        runId: input.runId,
        personaRunId: persona.id,
        userId: input.userId,
        stepNumber,
        url: page.url(),
        screenshotPath,
        decision,
        actionResult
      })

      await insertIssues(client, {
        runId: input.runId,
        personaRunId: persona.id,
        userId: input.userId,
        stepNumber,
        screenshotPath,
        decision
      })

      history.push({
        step: stepNumber,
        observation: decision.observation,
        action: sanitizeAction(decision.next_action)
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
    videoPath = await uploadRunVideo(client, input.runId, persona.id, video).catch(() => null)
    if (videoPath) {
      await savePersonaVideoPath(client, persona.id, input.userId, videoPath).catch(() => undefined)
    }
    await browser.close()
    await rm(videoDir, { recursive: true, force: true }).catch(() => undefined)
  }

  if (await shouldStopRun(client, input, signal)) {
    await markPersonaCancelled(client, input, persona)
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
    .eq('persona_run_id', persona.id)
    .eq('user_id', input.userId)
    .order('step_number', { ascending: true })

  const { data: issues } = await client
    .from('qa_issues')
    .select('*')
    .eq('run_id', input.runId)
    .eq('persona_run_id', persona.id)
    .eq('user_id', input.userId)
    .order('created_at', { ascending: true })

  if (!run) {
    throw createError({ statusCode: 500, statusMessage: 'Run disappeared during execution' })
  }

  const report = generatePersonaMarkdownReport(run, {
    name: persona.name,
    role: persona.role,
    responsibilities: persona.responsibilities,
    report_focus: persona.reportFocus,
    goal: persona.goal,
    status: finalStatus,
    result: finalStatus,
    issue_count: issues?.length || 0
  }, steps || [], issues || [])

  await client
    .from('qa_run_personas')
    .update({
      status: finalStatus,
      result: finalStatus,
      issue_count: issues?.length || 0,
      video_path: videoPath,
      report_md: report,
      completed_at: new Date().toISOString()
    })
    .eq('id', persona.id)
    .eq('run_id', input.runId)
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

async function cancelQueuedPersonas(client: ReturnType<typeof createServiceSupabaseClient>, input: StartRunInput) {
  await client
    .from('qa_run_personas')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('run_id', input.runId)
    .eq('user_id', input.userId)
    .in('status', ['queued', 'running'])
}

async function markPersonaCancelled(client: ReturnType<typeof createServiceSupabaseClient>, input: StartRunInput, persona: RunPersonaInput) {
  await client
    .from('qa_run_personas')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', persona.id)
    .eq('run_id', input.runId)
    .eq('user_id', input.userId)
    .in('status', ['queued', 'running'])
}

function attachDiagnostics(page: Page): DiagnosticsRecorder {
  const recorder: DiagnosticsRecorder = {
    requestStartedAt: new Map(),
    requests: [],
    consoleMessages: [],
    pageErrors: []
  }

  page.on('request', (request) => {
    recorder.requestStartedAt.set(request, Date.now())
  })

  page.on('response', (response) => {
    const request = response.request()
    const startedAt = recorder.requestStartedAt.get(request) || Date.now()
    recorder.requests.push({
      url: trimUrl(request.url()),
      method: request.method(),
      resource_type: request.resourceType(),
      status: response.status(),
      duration_ms: Date.now() - startedAt
    })
    recorder.requestStartedAt.delete(request)
    trimDiagnostics(recorder)
  })

  page.on('requestfailed', (request) => {
    const startedAt = recorder.requestStartedAt.get(request) || Date.now()
    recorder.requests.push({
      url: trimUrl(request.url()),
      method: request.method(),
      resource_type: request.resourceType(),
      status: null,
      duration_ms: Date.now() - startedAt
    })
    recorder.requestStartedAt.delete(request)
    trimDiagnostics(recorder)
  })

  page.on('console', (message) => {
    recorder.consoleMessages.push({
      type: message.type(),
      text: message.text().slice(0, 500)
    })
    trimDiagnostics(recorder)
  })

  page.on('pageerror', (error) => {
    recorder.pageErrors.push(error.message.slice(0, 500))
    trimDiagnostics(recorder)
  })

  return recorder
}

async function readRuntimeDiagnostics(page: Page, recorder: DiagnosticsRecorder): Promise<RuntimeDiagnostics> {
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as {
      loadEventEnd?: number
      domContentLoadedEventEnd?: number
    } | undefined

    return {
      page_load_ms: nav?.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
      dom_content_loaded_ms: nav?.domContentLoadedEventEnd ? Math.round(nav.domContentLoadedEventEnd) : null
    }
  }).catch(() => ({
    page_load_ms: null,
    dom_content_loaded_ms: null
  }))
  const recentRequests = recorder.requests.slice(-20)

  return {
    page_load_ms: timing.page_load_ms,
    dom_content_loaded_ms: timing.dom_content_loaded_ms,
    recent_requests: recentRequests,
    slow_requests: recorder.requests
      .filter(request => request.duration_ms >= 750 || (request.status !== null && request.status >= 400))
      .slice(-12),
    console_messages: recorder.consoleMessages.slice(-12),
    page_errors: recorder.pageErrors.slice(-8)
  }
}

function describePersona(persona: RunPersonaInput) {
  return [
    `Name: ${persona.name}`,
    `Role: ${persona.role}`,
    `Responsibilities:\n${persona.responsibilities.map(item => `- ${item}`).join('\n')}`,
    `Report focus:\n${persona.reportFocus.map(item => `- ${item}`).join('\n')}`
  ].join('\n\n')
}

function trimDiagnostics(recorder: DiagnosticsRecorder) {
  recorder.requests.splice(0, Math.max(0, recorder.requests.length - 80))
  recorder.consoleMessages.splice(0, Math.max(0, recorder.consoleMessages.length - 40))
  recorder.pageErrors.splice(0, Math.max(0, recorder.pageErrors.length - 20))
}

function trimUrl(url: string) {
  return url.length > 240 ? `${url.slice(0, 237)}...` : url
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

      const text = substituteCredential(action.text, credentials)
      await locator.fill(text, { timeout: 8000 })
      return { result: { ...result, status: 'ok', text: maskIfSecret(action.text) }, cursorPosition: nextCursorPosition }
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

async function uploadScreenshot(client: ReturnType<typeof createServiceSupabaseClient>, runId: string, personaRunId: string, stepNumber: number, screenshot: Buffer) {
  const config = useRuntimeConfig()
  const bucket = config.screenshotBucket || process.env.SCREENSHOT_BUCKET || 'qa-screenshots'
  const path = `${runId}/${personaRunId}/step-${String(stepNumber).padStart(3, '0')}.png`
  const { error } = await client.storage.from(bucket).upload(path, screenshot, {
    contentType: 'image/png',
    upsert: true
  })

  if (error) {
    return null
  }

  return path
}

async function uploadRunVideo(client: ReturnType<typeof createServiceSupabaseClient>, runId: string, personaRunId: string, video: Video | null) {
  if (!video) {
    return null
  }

  const config = useRuntimeConfig()
  const bucket = config.screenshotBucket || process.env.SCREENSHOT_BUCKET || 'qa-screenshots'
  const sourcePath = await video.path()
  const file = await readFile(sourcePath)
  const path = `${runId}/${personaRunId}/run.webm`
  const { error } = await client.storage.from(bucket).upload(path, file, {
    contentType: 'video/webm',
    upsert: true
  })

  if (error) {
    return null
  }

  return path
}

async function savePersonaVideoPath(client: ReturnType<typeof createServiceSupabaseClient>, personaRunId: string, userId: string, videoPath: string) {
  await client
    .from('qa_run_personas')
    .update({ video_path: videoPath })
    .eq('id', personaRunId)
    .eq('user_id', userId)
}

async function insertStep(client: ReturnType<typeof createServiceSupabaseClient>, input: {
  runId: string
  personaRunId: string
  userId: string
  stepNumber: number
  url: string
  screenshotPath: string | null
  decision: AgentDecision
  actionResult: Record<string, unknown>
}) {
  await client.from('qa_steps').insert({
    run_id: input.runId,
    persona_run_id: input.personaRunId,
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
  personaRunId: string
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
    persona_run_id: input.personaRunId,
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

function credentialFields(credentials: RunCredentials) {
  return Object.entries(credentials)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => `credential.${key}`)
}

function substituteCredential(text: string, credentials: RunCredentials) {
  if (text === 'credential.username') {
    return credentials.username || ''
  }

  if (text === 'credential.password') {
    return credentials.password || ''
  }

  return text
}

function maskIfSecret(text: string) {
  return text.startsWith('credential.') ? text : text
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
