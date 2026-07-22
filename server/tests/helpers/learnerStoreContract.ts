import { describe, it, expect } from 'vitest'
import type { LearnerStore } from '../../src/learnerStore'
import type { MasteryState } from '../../src/store/types'

const mastery = (over: Partial<MasteryState> = {}): MasteryState =>
  ({ box: 1, attempts: 2, correct: 1, history: [true, false], lastSeenAt: 1000, ...over })

export interface LearnerCtx { store: LearnerStore; learnerId: string }

/**
 * Behaviour every LearnerStore implementation must satisfy, run against both
 * SqliteLearnerStore (offline) and SupabaseLearnerStore (integration). `setup` runs once
 * per test and returns a clean store plus an owner the backing store accepts (a real
 * auth user id on Supabase).
 */
export function learnerStoreContract(name: string, setup: () => Promise<LearnerCtx>): void {
  describe(`${name} (LearnerStore contract)`, () => {
    it('round-trips a card definition', async () => {
      const { store, learnerId: L } = await setup()
      await store.upsertCard(L, 'bio', 'cell', 'the basic unit of life')
      expect(await store.getCardDefinition(L, 'bio', 'cell')).toBe('the basic unit of life')
      expect(await store.getCardDefinition(L, 'bio', 'unknown')).toBeUndefined()
    })

    it('upsertCard overwrites an existing definition', async () => {
      const { store, learnerId: L } = await setup()
      await store.upsertCard(L, 'bio', 'cell', 'first')
      await store.upsertCard(L, 'bio', 'cell', 'second')
      expect(await store.getCardDefinition(L, 'bio', 'cell')).toBe('second')
    })

    it('round-trips mastery (history preserved) keyed by term', async () => {
      const { store, learnerId: L } = await setup()
      expect(await store.getMastery(L, 'bio', 'cell')).toBeUndefined()
      await store.setMastery(L, 'bio', 'cell', mastery())
      expect(await store.getMastery(L, 'bio', 'cell')).toEqual(mastery())
    })

    it('setMastery overwrites the prior state', async () => {
      const { store, learnerId: L } = await setup()
      await store.setMastery(L, 'bio', 'cell', mastery())
      await store.setMastery(L, 'bio', 'cell', mastery({ box: 4, attempts: 9, correct: 8, history: [true], lastSeenAt: 5000 }))
      expect(await store.getMastery(L, 'bio', 'cell')).toEqual({ box: 4, attempts: 9, correct: 8, history: [true], lastSeenAt: 5000 })
    })

    it('topicSummary counts cards, mastered (box>=4), and seen (attempts>0)', async () => {
      const { store, learnerId: L } = await setup()
      await store.upsertCard(L, 'bio', 'cell', 'd1'); await store.upsertCard(L, 'bio', 'gene', 'd2'); await store.upsertCard(L, 'bio', 'enzyme', 'd3')
      await store.setMastery(L, 'bio', 'cell', mastery({ box: 4, attempts: 5 }))
      await store.setMastery(L, 'bio', 'gene', mastery({ box: 2, attempts: 3 }))
      expect(await store.topicSummary(L, 'bio')).toEqual({ total: 3, mastered: 1, seen: 2 })
    })

    it('persists a personal best per topic', async () => {
      const { store, learnerId: L } = await setup()
      expect(await store.getPersonalBest(L, 'bio')).toBeUndefined()
      await store.setPersonalBest(L, 'bio', 42)
      expect(await store.getPersonalBest(L, 'bio')).toBe(42)
      await store.setPersonalBest(L, 'bio', 30)
      expect(await store.getPersonalBest(L, 'bio')).toBe(30)
    })

    it('awardCorrect adds points + advances streak; resetStreak zeroes it and keeps best', async () => {
      const { store, learnerId: L } = await setup()
      expect(await store.getStats(L)).toEqual({ points: 0, currentStreak: 0, bestStreak: 0 })
      await store.awardCorrect(L, 10); await store.awardCorrect(L, 10)
      expect(await store.getStats(L)).toEqual({ points: 20, currentStreak: 2, bestStreak: 2 })
      await store.resetStreak(L)
      expect(await store.getStats(L)).toEqual({ points: 20, currentStreak: 0, bestStreak: 2 })
      await store.awardCorrect(L, 10)
      expect(await store.getStats(L)).toEqual({ points: 30, currentStreak: 1, bestStreak: 2 })
    })

    it('dueItems returns only seen items older than the threshold', async () => {
      const { store, learnerId: L } = await setup()
      await store.upsertCard(L, 'bio', 'old', 'd'); await store.upsertCard(L, 'bio', 'recent', 'd'); await store.upsertCard(L, 'bio', 'unseen', 'd')
      await store.setMastery(L, 'bio', 'old', mastery({ attempts: 1, lastSeenAt: 1000 }))
      await store.setMastery(L, 'bio', 'recent', mastery({ attempts: 1, lastSeenAt: 9000 }))
      await store.setMastery(L, 'bio', 'unseen', mastery({ attempts: 0, lastSeenAt: 0 }))
      const due = (await store.dueItems(L, 10000, 5000)).map((d) => d.term) // now=10000, threshold=5000
      expect(due).toEqual(['old']) // old: 10000-1000=9000>=5000; recent: 1000<5000; unseen: attempts 0
    })

    it('records retention events and summarizes them', async () => {
      const { store, learnerId: L } = await setup()
      expect(await store.retentionSummary(L)).toEqual({ checks: 0, heldRate: 0, avgDelayMs: 0 })
      await store.recordRetention(L, 'bio', 'cell', 100000, true, 1)
      await store.recordRetention(L, 'bio', 'gene', 200000, false, 2)
      const sum = await store.retentionSummary(L)
      expect(sum.checks).toBe(2)
      expect(sum.heldRate).toBe(0.5)
      expect(sum.avgDelayMs).toBe(150000)
    })

    it('lists distinct topics', async () => {
      const { store, learnerId: L } = await setup()
      await store.upsertCard(L, 'bio', 'cell', 'd'); await store.upsertCard(L, 'bio', 'gene', 'd'); await store.upsertCard(L, 'algebra', 'x', 'd')
      expect(new Set(await store.topics(L))).toEqual(new Set(['bio', 'algebra']))
    })
  })
}
