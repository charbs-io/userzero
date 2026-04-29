export type RunStatus = 'queued' | 'running' | 'completed' | 'blocked' | 'failed'
export type IssueSeverity = 'low' | 'medium' | 'high'

export interface SiteGithubConnection {
  site_id: string
  installation_id: number
  repository_id: number
  owner: string
  repo: string
  full_name: string
  html_url: string
  default_branch: string
  permissions: Record<string, unknown>
  use_repository_context: boolean
  allow_issue_creation: boolean
  allow_pr_creation: boolean
  connected_at: string
  disconnected_at: string | null
  updated_at: string
}

export interface Site {
  id: string
  user_id: string
  base_url: string
  hostname: string
  verification_method: 'meta' | 'txt' | null
  verified_at: string | null
  last_checked_at: string | null
  created_at: string
  updated_at: string
  github_connection: SiteGithubConnection | null
}

export interface OpenAISettingsStatus {
  configured: boolean
  updated_at: string | null
}

export interface QaRun {
  id: string
  site_id: string | null
  target_url: string
  target_hostname: string
  persona: string
  goal: string
  max_steps: number
  status: RunStatus
  result: 'completed' | 'partially_completed' | 'blocked' | null
  error: string | null
  issue_count: number
  video_path: string | null
  video_url?: string | null
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
