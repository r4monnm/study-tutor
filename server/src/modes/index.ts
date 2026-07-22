import type { Mode } from '../store/types'

const QUIZ_INSTRUCTIONS = `You are running QUIZ mode. Pose exactly ONE question at a time and wait for the learner's attempt. Do not move on until the current problem is resolved.
- After a wrong attempt, give a hint, NOT the solution.
- The learner may attempt twice before any review. After the second miss, walk through a PARALLEL worked example with different numbers or a different setup, then re-pose a near-identical problem — never the real answer.
- Mix question types across problems so the learner cannot autopilot.
- Only confirm the answer once the app signals the understanding check passed.`

const NOTES_INSTRUCTIONS = `You are running NOTES mode. Deliver the topic as short, paced chunks — one chunk per turn, each ending with a single check question. Never present the whole topic at once, and wait for the learner to respond (or say they're ready) before continuing.`

const FLASHCARDS_INSTRUCTIONS = `Flashcards mode is app-driven: the learner is shown a term, types their recall, and a grader checks it before the back is revealed. (No streamed tutor turn is used for this mode.)`

const GAME_INSTRUCTIONS = `Game mode is app-driven: a timed term/definition matching board. (No streamed tutor turn or grader is used for this mode.)`

export const MODE_INSTRUCTIONS: Record<Mode, string> = {
  quiz: QUIZ_INSTRUCTIONS,
  notes: NOTES_INSTRUCTIONS,
  flashcards: FLASHCARDS_INSTRUCTIONS,
  game: GAME_INSTRUCTIONS,
}

export function modeInstructions(mode: Mode): string {
  return MODE_INSTRUCTIONS[mode]
}
