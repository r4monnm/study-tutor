import type { Problem } from './store/types'

export const GREETING =
  "Hi! I'm your study tutor. Tell me a topic you want to study, then pick a mode. I'll help you work through it — but I won't just hand you answers."

// Strips the hidden fields. There is no path from a Problem to the wire except through this.
export function toClientProblem(p: Problem): { id: string; question: string; qType: string } {
  return { id: p.id, question: p.question, qType: p.qType }
}
