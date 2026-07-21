import type { Mode } from '../store/types'

const QUIZ_INSTRUCTIONS = `You are running QUIZ mode. Pose exactly ONE question at a time and wait for the learner's attempt. Do not move on until the current problem is resolved.
- After a wrong attempt, give a hint, NOT the solution.
- The learner may attempt twice before any review. After the second miss, walk through a PARALLEL worked example with different numbers or a different setup, then re-pose a near-identical problem — never the real answer.
- Mix question types across problems so the learner cannot autopilot.
- Only confirm the answer once the app signals the understanding check passed.`

export const MODE_INSTRUCTIONS: Record<Mode, string> = {
  quiz: QUIZ_INSTRUCTIONS,
  notes: 'This mode is not available yet. Tell the learner to pick Quiz mode.',
  flashcards: 'This mode is not available yet. Tell the learner to pick Quiz mode.',
  game: 'This mode is not available yet. Tell the learner to pick Quiz mode.',
}

export function modeInstructions(mode: Mode): string {
  return MODE_INSTRUCTIONS[mode]
}
