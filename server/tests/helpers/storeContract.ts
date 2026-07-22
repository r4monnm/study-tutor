import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Store, Problem } from '../../src/store/types'

const makeProblem = (): Problem => ({
  id: randomUUID(), question: 'What is 2+2?', correct_answer: 'FOUR',
  correct_approach: 'add the two numbers', qType: 'arithmetic',
})

export interface StoreCtx { store: Store; learnerId: string }

/**
 * Behaviour every Store implementation must satisfy, run against both MemoryStore
 * (offline) and SupabaseStore (integration). `setup` runs once per test and returns a
 * clean store plus an owner the backing store accepts — a free string for memory, a
 * real auth user id for Supabase.
 */
export function storeContract(name: string, setup: () => Promise<StoreCtx>): void {
  describe(`${name} (Store contract)`, () => {
    it('creates sessions with unique ids', async () => {
      const { store, learnerId } = await setup()
      const a = await store.createSession(learnerId)
      const b = await store.createSession(learnerId)
      expect(a.id).not.toBe(b.id)
      expect(await store.getSession(a.id)).toBeDefined()
    })

    it('returns undefined for an unknown session', async () => {
      const { store } = await setup()
      expect(await store.getSession(randomUUID())).toBeUndefined()
    })

    it('starts a session empty and remembers its learner', async () => {
      const { store, learnerId } = await setup()
      const sess = await store.createSession(learnerId)
      expect(sess.learnerId).toBe(learnerId)
      expect(sess.topic).toBe('')
      expect(sess.mode).toBe('quiz')
      expect(sess.history).toEqual([])
      expect(sess.problems).toEqual({})
    })

    it('stores a problem, marks it active, inits locked state', async () => {
      const { store, learnerId } = await setup()
      const sess = await store.createSession(learnerId)
      const problem = makeProblem()
      await store.putProblem(sess.id, problem)
      expect((await store.getActiveProblem(sess.id))?.id).toBe(problem.id)
      expect(await store.getProblemState(sess.id, problem.id)).toEqual({ hintLevel: 0, lastGraderHint: '', unlocked: false })
    })

    it('round-trips a problem including its hidden fields', async () => {
      const { store, learnerId } = await setup()
      const sess = await store.createSession(learnerId)
      const problem = makeProblem()
      await store.putProblem(sess.id, problem)
      expect(await store.getProblem(sess.id, problem.id)).toEqual(problem)
    })

    it('updates topic, turns, and problem state', async () => {
      const { store, learnerId } = await setup()
      const sess = await store.createSession(learnerId)
      const problem = makeProblem()
      await store.setTopicMode(sess.id, 'algebra', 'quiz')
      await store.addTurn(sess.id, { role: 'user', content: 'hi' })
      await store.putProblem(sess.id, problem)
      await store.setProblemState(sess.id, problem.id, { hintLevel: 2, lastGraderHint: 'try again', unlocked: true })
      const out = (await store.getSession(sess.id))!
      expect(out.topic).toBe('algebra')
      expect(out.mode).toBe('quiz')
      expect(out.history).toHaveLength(1)
      expect((await store.getProblemState(sess.id, problem.id)).unlocked).toBe(true)
    })

    it('keeps history in the order it was added', async () => {
      const { store, learnerId } = await setup()
      const sess = await store.createSession(learnerId)
      await store.addTurn(sess.id, { role: 'user', content: 'first' })
      await store.addTurn(sess.id, { role: 'assistant', content: 'second' })
      await store.addTurn(sess.id, { role: 'user', content: 'third' })
      const out = (await store.getSession(sess.id))!
      expect(out.history).toEqual([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'second' },
        { role: 'user', content: 'third' },
      ])
    })

    it('hydrates every stored problem onto the session', async () => {
      const { store, learnerId } = await setup()
      const sess = await store.createSession(learnerId)
      const a = makeProblem()
      const b = { ...makeProblem(), qType: 'word-problem' }
      await store.putProblem(sess.id, a)
      await store.putProblem(sess.id, b)
      const out = (await store.getSession(sess.id))!
      expect(Object.keys(out.problems)).toHaveLength(2)
      expect(Object.values(out.problems).map((p) => p.problem.qType).sort()).toEqual(['arithmetic', 'word-problem'])
      // The newest problem is the active one.
      expect((await store.getActiveProblem(sess.id))?.id).toBe(b.id)
    })

    it('round-trips a deck and replaces it on rewrite', async () => {
      const { store, learnerId } = await setup()
      const sess = await store.createSession(learnerId)
      expect(await store.getDeck(sess.id)).toBeUndefined()
      await store.putDeck(sess.id, { topic: 'bio', cards: [{ id: 'c1', term: 'cell', definition: 'unit of life' }] })
      expect(await store.getDeck(sess.id)).toEqual({ topic: 'bio', cards: [{ id: 'c1', term: 'cell', definition: 'unit of life' }] })
      await store.putDeck(sess.id, { topic: 'algebra', cards: [{ id: 'c2', term: 'slope', definition: 'rise over run' }] })
      expect((await store.getDeck(sess.id))?.topic).toBe('algebra')
    })

    it('scopes state to its own session', async () => {
      const { store, learnerId } = await setup()
      const a = await store.createSession(learnerId)
      const b = await store.createSession(learnerId)
      await store.setTopicMode(a.id, 'bio', 'notes')
      await store.addTurn(a.id, { role: 'user', content: 'only in a' })
      const outB = (await store.getSession(b.id))!
      expect(outB.topic).toBe('')
      expect(outB.history).toEqual([])
      expect(await store.getActiveProblem(b.id)).toBeUndefined()
    })
  })
}
