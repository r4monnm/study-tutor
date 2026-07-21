import { describe, it, expect } from 'vitest'
import { applyVerdict, canReveal, initialProblemState } from '../src/gate'
import { nextHintLevel, atCap } from '../src/hints'

describe('answer gate', () => {
  it('starts locked at hint level 0', () => {
    const s = initialProblemState()
    expect(canReveal(s)).toBe(false)
    expect(s.hintLevel).toBe(0)
  })

  it('unlocks ONLY when understanding is demonstrated', () => {
    const s = initialProblemState()
    const passed = applyVerdict(s, { understanding_demonstrated: true, reason: 'clear', next_hint: '' }, 3)
    expect(canReveal(passed)).toBe(true)
  })

  it('a failed verdict never unlocks and bumps the hint level', () => {
    let s = initialProblemState()
    s = applyVerdict(s, { understanding_demonstrated: false, reason: 'vague', next_hint: 'h1' }, 3)
    expect(canReveal(s)).toBe(false)
    expect(s.hintLevel).toBe(1)
    expect(s.lastGraderHint).toBe('h1')
  })

  it('hint level is capped', () => {
    expect(nextHintLevel(3, 3)).toBe(3)
    expect(atCap(3, 3)).toBe(true)
    expect(atCap(2, 3)).toBe(false)
  })
})
