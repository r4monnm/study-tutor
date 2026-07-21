import { randomUUID } from 'node:crypto'
import { config } from './config'
import type { Llm } from './llm/types'
import type { Problem } from './store/types'

export const PROBLEM_SYSTEM = `You generate ONE self-contained quiz problem for a Socratic tutor.
Return a question the learner can attempt, plus the hidden correct answer and the hidden correct approach.
- "question": the prompt shown to the learner. Do NOT include the answer in it.
- "correct_answer": the final answer, concise.
- "correct_approach": how to solve it, step by step, WITHOUT restating the final answer — this is given only to an automated grader.
- "qType": a short label for the question type (e.g. "definition", "computation", "application"), used to vary future questions.`

export const PROBLEM_SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    correct_answer: { type: 'string' },
    correct_approach: { type: 'string' },
    qType: { type: 'string' },
  },
  required: ['question', 'correct_answer', 'correct_approach', 'qType'],
  additionalProperties: false,
} as const

export async function generateProblem(
  llm: Llm,
  input: { topic: string; priorQTypes: string[] },
): Promise<Problem> {
  const avoid = input.priorQTypes.length ? input.priorQTypes.join(', ') : 'none'
  const user = `Topic: ${input.topic}\nAvoid repeating these question types when possible: ${avoid}\nGenerate one quiz problem now.`
  const raw = await llm.completeJson<Omit<Problem, 'id'>>({
    model: config.problemModel,
    system: PROBLEM_SYSTEM,
    user,
    schema: PROBLEM_SCHEMA,
    maxTokens: 1024,
  })
  return { id: randomUUID(), ...raw }
}
