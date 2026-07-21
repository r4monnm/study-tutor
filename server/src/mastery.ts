import type { Card, MasteryState } from './store/types'

export const MASTERY = { maxBox: 4, masteredBox: 4, historyCap: 20 }

export function initialMasteryState(): MasteryState {
  return { box: 0, attempts: 0, correct: 0, history: [], lastSeenAt: 0 }
}

export function applyRecall(state: MasteryState, correct: boolean, now: number): MasteryState {
  return {
    box: correct ? Math.min(state.box + 1, MASTERY.maxBox) : 0,
    attempts: state.attempts + 1,
    correct: state.correct + (correct ? 1 : 0),
    history: [...state.history, correct].slice(-MASTERY.historyCap),
    lastSeenAt: now,
  }
}

export function isMastered(state: MasteryState): boolean {
  return state.box >= MASTERY.masteredBox
}

// Orders cards weakest-first: lowest box, then least-recently-seen, then fewest attempts.
// Cards with no state are treated as a fresh (box 0, lastSeen 0) card.
export function weakestFirst(entries: { card: Card; state: MasteryState | undefined }[]): Card[] {
  return entries
    .map((e) => ({ card: e.card, state: e.state ?? initialMasteryState() }))
    .sort(
      (a, b) =>
        a.state.box - b.state.box ||
        a.state.lastSeenAt - b.state.lastSeenAt ||
        a.state.attempts - b.state.attempts,
    )
    .map((e) => e.card)
}
