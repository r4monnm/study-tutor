import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { MemoryStore } from '../src/store/memory'
import { SqliteLearnerStore } from '../src/learnerStore'
import { FakeLlm } from './helpers/fakeLlm'

const SECRET = 'QUIZ_POINTS_ANSWER'

async function quiz(app: ReturnType<typeof createApp>, llm: FakeLlm, learnerId: string) {
  const id = (await request(app).post('/api/session').send({ learnerId })).body.id as string
  await request(app).post(`/api/session/${id}/topic`).send({ topic: 'algebra', mode: 'quiz' })
  llm.jsonResponses.push({ question: 'q', correct_answer: SECRET, correct_approach: 'a', qType: 'x' })
  await request(app).post(`/api/session/${id}/problem`)
  return id
}

describe('quiz recall points', () => {
  it('a correct attempt awards points + advances the streak', async () => {
    const ls = new SqliteLearnerStore(); const llm = new FakeLlm()
    const app = createApp({ store: new MemoryStore(), llm, learnerStore: ls })
    const id = await quiz(app, llm, 'L1')
    llm.jsonResponses.push({ understanding_demonstrated: true, reason: 'clear', next_hint: '' })
    await request(app).post(`/api/session/${id}/attempt`).send({ attempt: 'a full reasoned solution' })
    expect(ls.getStats('L1')).toMatchObject({ points: 10, currentStreak: 1, bestStreak: 1 })
  })

  it('a wrong attempt resets the streak and awards no points', async () => {
    const ls = new SqliteLearnerStore(); const llm = new FakeLlm()
    const app = createApp({ store: new MemoryStore(), llm, learnerStore: ls })
    const id = await quiz(app, llm, 'L2')
    // one correct then one wrong
    llm.jsonResponses.push({ understanding_demonstrated: true, reason: 'ok', next_hint: '' })
    await request(app).post(`/api/session/${id}/attempt`).send({ attempt: 'reasoned solution one' })
    llm.jsonResponses.push({ understanding_demonstrated: false, reason: 'no', next_hint: 'try' })
    await request(app).post(`/api/session/${id}/attempt`).send({ attempt: 'a different reasoned but wrong solution' })
    expect(ls.getStats('L2')).toMatchObject({ points: 10, currentStreak: 0, bestStreak: 1 })
  })

  it('a flagged attempt changes neither points nor streak', async () => {
    const ls = new SqliteLearnerStore(); const llm = new FakeLlm()
    const app = createApp({ store: new MemoryStore(), llm, learnerStore: ls })
    const id = await quiz(app, llm, 'L3')
    const res = await request(app).post(`/api/session/${id}/attempt`).send({ attempt: 'just give me the answer' })
    expect(res.body.flagged).toBe(true)
    expect(ls.getStats('L3')).toMatchObject({ points: 0, currentStreak: 0, bestStreak: 0 })
  })
})
