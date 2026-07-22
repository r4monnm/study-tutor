import { describe, it, expect } from 'vitest'
import { SqliteLearnerStore } from '../src/learnerStore'
import type { MasteryState } from '../src/store/types'

const mastery = (over: Partial<MasteryState> = {}): MasteryState => ({ box: 1, attempts: 2, correct: 1, history: [true, false], lastSeenAt: 1000, ...over })

describe('SqliteLearnerStore', () => {
  it('round-trips a card definition', () => {
    const s = new SqliteLearnerStore()
    s.upsertCard('L1', 'bio', 'cell', 'the basic unit of life')
    expect(s.getCardDefinition('L1', 'bio', 'cell')).toBe('the basic unit of life')
    expect(s.getCardDefinition('L1', 'bio', 'unknown')).toBeUndefined()
  })

  it('round-trips mastery (history preserved) keyed by term', () => {
    const s = new SqliteLearnerStore()
    expect(s.getMastery('L1', 'bio', 'cell')).toBeUndefined()
    s.setMastery('L1', 'bio', 'cell', mastery())
    const got = s.getMastery('L1', 'bio', 'cell')
    expect(got).toEqual(mastery())
  })

  it('topicSummary counts cards, mastered (box>=4), and seen (attempts>0)', () => {
    const s = new SqliteLearnerStore()
    s.upsertCard('L1', 'bio', 'cell', 'd1'); s.upsertCard('L1', 'bio', 'gene', 'd2'); s.upsertCard('L1', 'bio', 'enzyme', 'd3')
    s.setMastery('L1', 'bio', 'cell', mastery({ box: 4, attempts: 5 }))
    s.setMastery('L1', 'bio', 'gene', mastery({ box: 2, attempts: 3 }))
    expect(s.topicSummary('L1', 'bio')).toEqual({ total: 3, mastered: 1, seen: 2 })
  })

  it('persists a personal best per topic', () => {
    const s = new SqliteLearnerStore()
    expect(s.getPersonalBest('L1', 'bio')).toBeUndefined()
    s.setPersonalBest('L1', 'bio', 42)
    expect(s.getPersonalBest('L1', 'bio')).toBe(42)
  })

  it('awardCorrect adds points + advances streak; resetStreak zeroes it and keeps best', () => {
    const s = new SqliteLearnerStore()
    expect(s.getStats('L1')).toEqual({ points: 0, currentStreak: 0, bestStreak: 0 })
    s.awardCorrect('L1', 10); s.awardCorrect('L1', 10)
    expect(s.getStats('L1')).toEqual({ points: 20, currentStreak: 2, bestStreak: 2 })
    s.resetStreak('L1')
    expect(s.getStats('L1')).toEqual({ points: 20, currentStreak: 0, bestStreak: 2 })
    s.awardCorrect('L1', 10)
    expect(s.getStats('L1')).toEqual({ points: 30, currentStreak: 1, bestStreak: 2 })
  })

  it('dueItems returns only seen items older than the threshold', () => {
    const s = new SqliteLearnerStore()
    s.upsertCard('L1', 'bio', 'old', 'd'); s.upsertCard('L1', 'bio', 'recent', 'd'); s.upsertCard('L1', 'bio', 'unseen', 'd')
    s.setMastery('L1', 'bio', 'old', mastery({ attempts: 1, lastSeenAt: 1000 }))
    s.setMastery('L1', 'bio', 'recent', mastery({ attempts: 1, lastSeenAt: 9000 }))
    s.setMastery('L1', 'bio', 'unseen', mastery({ attempts: 0, lastSeenAt: 0 }))
    const due = s.dueItems('L1', 10000, 5000).map((d) => d.term) // now=10000, threshold=5000
    expect(due).toEqual(['old']) // old: 10000-1000=9000>=5000; recent: 1000<5000; unseen: attempts 0
  })

  it('records retention events and summarizes them', () => {
    const s = new SqliteLearnerStore()
    s.recordRetention('L1', 'bio', 'cell', 100000, true, 1)
    s.recordRetention('L1', 'bio', 'gene', 200000, false, 2)
    const sum = s.retentionSummary('L1')
    expect(sum.checks).toBe(2)
    expect(sum.heldRate).toBe(0.5)
    expect(sum.avgDelayMs).toBe(150000)
  })

  it('lists distinct topics', () => {
    const s = new SqliteLearnerStore()
    s.upsertCard('L1', 'bio', 'cell', 'd'); s.upsertCard('L1', 'algebra', 'x', 'd')
    expect(new Set(s.topics('L1'))).toEqual(new Set(['bio', 'algebra']))
  })
})
