import OpenAI from 'openai'
import { createError } from 'h3'
import { agentDecisionSchema, type AgentDecision, type ElementInventoryItem } from '../agent-types'

type DecideInput = {
  persona: string
  goal: string
  currentUrl: string
  stepNumber: number
  history: Array<{ step: number, observation: string, action: Record<string, unknown> }>
  elements: ElementInventoryItem[]
  screenshot: Buffer
  credentialFields: string[]
}

export async function decideNextAction(input: DecideInput): Promise<AgentDecision> {
  const config = useRuntimeConfig()
  if (!config.openaiApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'OPENAI_API_KEY is not configured' })
  }

  const client = new OpenAI({ apiKey: config.openaiApiKey })
  const screenshotDataUrl = `data:image/png;base64,${input.screenshot.toString('base64')}`

  const response = await client.responses.create({
    model: config.openaiModel,
    instructions: [
      'You are Ghost Customer, an AI QA/customer-simulation agent.',
      'Use the screenshot and element inventory to choose the next Playwright action toward the user goal.',
      'Prefer target_id from the element inventory. Use coordinates only indirectly by leaving target_id blank if no element matches.',
      'Never invent credentials. If a credential is needed, put credential.username or credential.password in next_action.text.',
      'Report only issues visible from this journey. Be specific, concise, and avoid duplicates.'
    ].join('\n'),
    input: [{
      role: 'user',
      content: [{
        type: 'input_text',
        text: JSON.stringify({
          persona: input.persona,
          goal: input.goal,
          current_url: input.currentUrl,
          step_number: input.stepNumber,
          available_credential_fields: input.credentialFields,
          history: input.history.slice(-8),
          elements: input.elements.slice(0, 80)
        })
      }, {
        type: 'input_image',
        image_url: screenshotDataUrl,
        detail: 'high'
      }]
    }],
    text: {
      format: {
        type: 'json_schema',
        name: 'ghost_customer_decision',
        strict: true,
        schema: agentDecisionSchema
      }
    }
  })

  const parsed = JSON.parse(response.output_text) as AgentDecision
  return parsed
}
