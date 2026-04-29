type ReportRun = {
  target_url: string
  persona: string
  goal: string
  status: string
  result: string | null
  created_at: string
}

type ReportStep = {
  step_number: number
  observation: string
  action: Record<string, unknown>
  screenshot_path: string | null
}

type ReportIssue = {
  title: string
  severity: string
  category: string
  description: string
  evidence: string
  suggested_fix: string
  step_number: number | null
  screenshot_path: string | null
}

export function generateMarkdownReport(run: ReportRun, steps: ReportStep[], issues: ReportIssue[]) {
  const result = run.result || (run.status === 'completed' ? 'completed' : run.status)
  const summary = issues.length
    ? `Product Warden found ${issues.length} issue${issues.length === 1 ? '' : 's'} while attempting the requested journey.`
    : 'Product Warden did not record any issues during this journey.'

  return `# Ghost Customer QA Report

## Test Setup
- URL: ${run.target_url}
- Persona: ${run.persona}
- Goal: ${run.goal}
- Date/time: ${new Date(run.created_at).toISOString()}
- Result: ${result}

## Executive Summary
${summary}

## Journey Trace
| Step | Action | Observation | Screenshot |
| --- | --- | --- | --- |
${steps.map(step => `| ${step.step_number} | ${readActionType(step.action)} | ${escapeTable(step.observation)} | ${step.screenshot_path || 'none'} |`).join('\n')}

## Issues Found
${issues.length
  ? issues.map(issue => `### ${issue.title}
- Severity: ${issue.severity}
- Category: ${issue.category}
- Repro steps: Review step ${issue.step_number || 'unknown'} and repeat the visible action.
- Expected behavior: The product should let the persona continue toward the stated goal without avoidable confusion or failure.
- Actual behavior: ${issue.description}
- Evidence screenshot: ${issue.screenshot_path || 'none'}
- Suggested fix: ${issue.suggested_fix}
`).join('\n')
  : 'No issues recorded.'}

## UX Friction
${issues.filter(issue => ['ux', 'copy', 'navigation', 'accessibility'].includes(issue.category)).map(issue => `- ${issue.description}`).join('\n') || '- No UX friction recorded.'}

## Recommended Fix Priority
${priorityList(issues)}
`
}

function priorityList(issues: ReportIssue[]) {
  const high = issues.filter(issue => issue.severity === 'high')
  const medium = issues.filter(issue => issue.severity === 'medium')
  const low = issues.filter(issue => issue.severity === 'low')

  return [
    `- P0: ${high.map(issue => issue.title).join(', ') || 'None'}`,
    `- P1: ${medium.map(issue => issue.title).join(', ') || 'None'}`,
    `- P2: ${low.map(issue => issue.title).join(', ') || 'None'}`
  ].join('\n')
}

function escapeTable(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function readActionType(action: Record<string, unknown>) {
  return typeof action.type === 'string' ? action.type : 'observe'
}
