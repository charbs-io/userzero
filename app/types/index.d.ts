export type RunStatus = 'queued' | 'running' | 'completed' | 'blocked' | 'failed' | 'cancelled'
export type IssueSeverity = 'low' | 'medium' | 'high'

export interface VerifiedDomain {
  id: string
  hostname: string
  verification_method: 'meta' | 'txt' | null
  verified_at: string | null
  last_checked_at: string | null
  created_at: string
}

export interface QaRun {
  id: string
  target_url: string
  target_hostname: string
  persona: string
  goal: string
  max_steps: number
  status: RunStatus
  result: 'completed' | 'partially_completed' | 'blocked' | null
  error: string | null
  issue_count: number
  report_md: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface QaStep {
  id: string
  run_id: string
  step_number: number
  url: string
  screenshot_path: string | null
  screenshot_url?: string | null
  observation: string
  progress: string
  action: Record<string, unknown>
  result: Record<string, unknown>
  created_at: string
}

export interface QaIssue {
  id: string
  run_id: string
  step_number: number | null
  category: 'bug' | 'ux' | 'accessibility' | 'copy' | 'navigation'
  severity: IssueSeverity
  title: string
  description: string
  evidence: string
  suggested_fix: string
  screenshot_path: string | null
  screenshot_url?: string | null
  created_at: string
}
