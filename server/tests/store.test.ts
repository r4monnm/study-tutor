import { describe, it, expect } from 'vitest'
import { MemoryStore } from '../src/store/memory'
import type { Problem } from '../src/store/types'

const problem: Problem = {
  id: 'p1', question: 'What is 2+2?', correct_answer: 'FOUR',
  correct_approach: 'add the two numbers', qType: 'arithmetic',
}

describe('MemoryStore', () => {
  it('creates sessions with unique ids', () => {
    const s = new MemoryStore()
    const a = s.createSession(); const b = s.createSession()
    expect(a.id).not.toBe(b.id)
    expect(s.getSession(a.id)).toBeDefined()
  })

  it('stores a problem, marks it active, inits locked state', () => {
    const s = new MemoryStore(); const sess = s.createSession()
    s.putProblem(sess.id, problem)
    expect(s.getActiveProblem(sess.id)?.id).toBe('p1')
    const state = s.getProblemState(sess.id, 'p1')
    expect(state).toEqual({ hintLevel: 0, lastGraderHint: '', unlocked: false })
  })

  it('updates topic, turns, and problem state', () => {
    const s = new MemoryStore(); const sess = s.createSession()
    s.setTopicMode(sess.id, 'algebra', 'quiz')
    s.addTurn(sess.id, { role: 'user', content: 'hi' })
    s.putProblem(sess.id, problem)
    s.setProblemState(sess.id, 'p1', { hintLevel: 2, lastGraderHint: 'try again', unlocked: true })
    const out = s.getSession(sess.id)!
    expect(out.topic).toBe('algebra')
    expect(out.mode).toBe('quiz')
    expect(out.history).toHaveLength(1)
    expect(s.getProblemState(sess.id, 'p1').unlocked).toBe(true)
  })
})
