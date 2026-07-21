import { describe, it, expect } from 'vitest'
import { initialMasteryState, applyRecall, isMastered, weakestFirst, MASTERY } from '../src/mastery'
import type { Card } from '../src/store/types'

describe('mastery (Leitner)', () => {
  it('a correct recall promotes the box and bumps counters', () => {
    const s = applyRecall(initialMasteryState(), true, 1000)
    expect(s.box).toBe(1)
    expect(s.attempts).toBe(1)
    expect(s.correct).toBe(1)
    expect(s.history).toEqual([true])
    expect(s.lastSeenAt).toBe(1000)
  })

  it('a miss resets the box to 0 but still records the attempt', () => {
    let s = applyRecall(initialMasteryState(), true, 1) // box 1
    s = applyRecall(s, true, 2) // box 2
    s = applyRecall(s, false, 3)
    expect(s.box).toBe(0)
    expect(s.attempts).toBe(3)
    expect(s.correct).toBe(2)
    expect(s.history).toEqual([true, true, false])
  })

  it('caps box at maxBox and reports mastered', () => {
    let s = initialMasteryState()
    for (let i = 0; i < 10; i++) s = applyRecall(s, true, i)
    expect(s.box).toBe(MASTERY.maxBox)
    expect(isMastered(s)).toBe(true)
  })

  it('caps history at 20 entries', () => {
    let s = initialMasteryState()
    for (let i = 0; i < 25; i++) s = applyRecall(s, true, i)
    expect(s.history).toHaveLength(20)
  })

  it('weakestFirst orders by box, then least-recently-seen, then attempts', () => {
    const cards: Card[] = [
      { id: 'a', term: 'A', definition: 'da' },
      { id: 'b', term: 'B', definition: 'db' },
      { id: 'c', term: 'C', definition: 'dc' },
    ]
    const entries = [
      { card: cards[0], state: { box: 3, attempts: 5, correct: 5, history: [], lastSeenAt: 10 } },
      { card: cards[1], state: undefined }, // unseen -> box 0, lastSeen 0
      { card: cards[2], state: { box: 0, attempts: 2, correct: 0, history: [], lastSeenAt: 50 } },
    ]
    const order = weakestFirst(entries).map((c) => c.id)
    expect(order).toEqual(['b', 'c', 'a']) // b (box0,seen0) < c (box0,seen50) < a (box3)
  })
})
