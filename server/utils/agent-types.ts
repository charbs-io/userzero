export type AgentActionType = 'click' | 'type' | 'scroll' | 'wait' | 'navigate' | 'stop'

export type AgentIssueCategory = 'bug' | 'ux' | 'accessibility' | 'copy' | 'navigation'

export type AgentDecision = {
  observation: string
  progress: string
  goal_status: 'in_progress' | 'completed' | 'blocked'
  confidence: number
  next_action: {
    type: AgentActionType
    target_id: string
    target_description: string
    text: string
    direction: 'up' | 'down' | 'none'
    url: string
    reason: string
  }
  possible_issues: Array<{
    title: string
    type: AgentIssueCategory
    severity: 'low' | 'medium' | 'high'
    description: string
    evidence: string
    suggested_fix: string
  }>
}

export type ElementInventoryItem = {
  id: string
  role: string
  tag: string
  text: string
  label: string
  placeholder: string
  href: string
  testId: string
  disabled: boolean
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
}

export const agentDecisionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    observation: { type: 'string' },
    progress: { type: 'string' },
    goal_status: { type: 'string', enum: ['in_progress', 'completed', 'blocked'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    next_action: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['click', 'type', 'scroll', 'wait', 'navigate', 'stop'] },
        target_id: { type: 'string' },
        target_description: { type: 'string' },
        text: { type: 'string' },
        direction: { type: 'string', enum: ['up', 'down', 'none'] },
        url: { type: 'string' },
        reason: { type: 'string' }
      },
      required: ['type', 'target_id', 'target_description', 'text', 'direction', 'url', 'reason']
    },
    possible_issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: ['bug', 'ux', 'accessibility', 'copy', 'navigation'] },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          description: { type: 'string' },
          evidence: { type: 'string' },
          suggested_fix: { type: 'string' }
        },
        required: ['title', 'type', 'severity', 'description', 'evidence', 'suggested_fix']
      }
    }
  },
  required: ['observation', 'progress', 'goal_status', 'confidence', 'next_action', 'possible_issues']
} as const
