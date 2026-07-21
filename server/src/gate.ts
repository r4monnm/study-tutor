import type { ProblemState } from './store/types'
import type { GraderVerdict } from './grader'
import { nextHintLevel } from './hints'

export function initialProblemState(): ProblemState {
  return { hintLevel: 0, lastGraderHint: '', unlocked: false }
}

// The ONLY place the gate can flip to unlocked. Driven purely by the grader boolean.
export function applyVerdict(state: ProblemState, verdict: GraderVerdict, cap: number): ProblemState {
  if (verdict.understanding_demonstrated) {
    return { ...state, unlocked: true }
  }
  return {
    unlocked: false,
    hintLevel: nextHintLevel(state.hintLevel, cap),
    lastGraderHint: verdict.next_hint,
  }
}

export function canReveal(state: ProblemState): boolean {
  return state.unlocked
}
