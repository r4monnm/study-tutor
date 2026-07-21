import { GRADER_SYSTEM } from './prompts/grader'
import { config } from './config'
import type { Llm } from './llm/types'

export interface GraderVerdict {
  understanding_demonstrated: boolean
  reason: string
  next_hint: string
}

export const GRADER_SCHEMA = {
  type: 'object',
  properties: {
    understanding_demonstrated: { type: 'boolean' },
    reason: { type: 'string' },
    next_hint: { type: 'string' },
  },
  required: ['understanding_demonstrated', 'reason', 'next_hint'],
  additionalProperties: false,
} as const

export async function grade(
  llm: Llm,
  input: { question: string; correct_approach: string; correct_answer: string; attempt: string },
): Promise<GraderVerdict> {
  const user = `PROBLEM:\n${input.question}\n\nCORRECT APPROACH:\n${input.correct_approach}\n\nCORRECT ANSWER:\n${input.correct_answer}\n\nSTUDENT ATTEMPT:\n${input.attempt}`
  return llm.completeJson<GraderVerdict>({
    model: config.graderModel,
    system: GRADER_SYSTEM,
    user,
    schema: GRADER_SCHEMA,
    maxTokens: 512,
  })
}
