import { tutorSystemPrompt } from './prompts/tutor'
import { atCap } from './hints'
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
  // The Anthropic Messages API requires the first message to be role 'user'.
  // The first tutor turn stores an assistant message (the posed question) with no
  // preceding user turn, so replayed history can begin with 'assistant'. Prepend a
  // synthetic user turn to keep the array API-valid.
  const messages: ChatTurn[] =
    raw[0].role === 'assistant' ? [{ role: 'user', content: 'Begin.' }, ...raw] : raw
  return { system, messages }
}
