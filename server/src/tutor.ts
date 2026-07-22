import { tutorSystemPrompt } from './prompts/tutor'
import { atCap } from './hints'
import { appendSandwich, TUTOR_SANDWICH } from './sandwich'
import type { ChatTurn, Mode } from './store/types'

export interface TutorContextInput {
  topic: string
  mode: Mode
  modeInstructions: string
  question: string
  history: ChatTurn[]
  hintLevel: number
  hintCap: number
  graderHint: string
  reveal: { answer: string; approach: string } | null
}

export function buildTutorContext(inp: TutorContextInput): { system: string[]; messages: ChatTurn[] } {
  const system: string[] = [
    tutorSystemPrompt({ mode: inp.mode, topic: inp.topic, modeInstructions: inp.modeInstructions }),
    `CURRENT PROBLEM (pose this to the learner; never state the answer while locked): ${inp.question}`,
  ]

  if (inp.reveal) {
    // Only reachable when the gate is unlocked. This is the ONLY branch that
    // places the answer into the tutor's context.
    system.push(
      `UNDERSTANDING CHECK PASSED. The app confirms the learner demonstrated understanding of this problem. ` +
        `You may now confirm and reveal the final answer. Correct answer: ${inp.reveal.answer}. ` +
        `Correct approach: ${inp.reveal.approach}. Congratulate them briefly, confirm the answer, and review the reasoning.`,
    )
  } else if (inp.graderHint) {
    const capNote = atCap(inp.hintLevel, inp.hintCap)
      ? ' They have reached the hint cap: walk through a PARALLEL example with different numbers or a different setup, then re-pose a near-identical problem. Do NOT state the real answer.'
      : ''
    system.push(
      `HINT CONTEXT: the learner has made ${inp.hintLevel} attempt(s) (cap ${inp.hintCap}). ` +
        `Weave in this nudge WITHOUT stating any final answer: "${inp.graderHint}".${capNote}`,
    )
  } else {
    system.push('The learner has not attempted yet. Pose the current problem and invite a first attempt. Do not hint at or reveal the answer.')
  }

  const raw: ChatTurn[] = inp.history.length ? inp.history : [{ role: 'user', content: 'Begin.' }]
  const ordered: ChatTurn[] =
    raw[0].role === 'assistant' ? [{ role: 'user', content: 'Begin.' }, ...raw] : raw
  // Sandwich: reiterate the no-answer rule AFTER user content — locked turns only
  // (on a reveal turn the app has already confirmed, so no reminder).
  const messages = inp.reveal ? ordered : appendSandwich(ordered, TUTOR_SANDWICH)
  return { system, messages }
}
