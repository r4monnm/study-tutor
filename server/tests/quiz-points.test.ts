import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { MemoryStore } from '../src/store/memory'
import { SqliteLearnerStore } from '../src/sqliteLearnerStore'
import { FakeLlm } from './helpers/fakeLlm'
import { fakeAuth } from './helpers/fakeAuth'

const SECRET = 'QUIZ_POINTS_ANSWER'

// The learner is whoever the token says they are, so the app is built per learner.
function setup(learnerId: string) {
  const ls = new SqliteLearnerStore()
  const llm = new FakeLlm()
  const app = createApp({ store: new MemoryStore(), llm, learnerStore: ls, auth: fakeAuth({ defaultUser: learnerId }) })
  return { ls, llm, app }
}

async function quiz(app: ReturnType<typeof createApp>, llm: FakeLlm) {
  const id = (await request(app).post('/api/session')).body.id as string
  await request(app).post(`/api/session/${id}/topic`).send({ topic: 'algebra', mode: 'quiz' })
  llm.jsonResponses.push({ question: 'q', correct_answer: SECRET, correct_approach: 'a', qType: 'x' })
  await request(app).post(`/api/session/${id}/problem`)
  return id
}

describe('quiz recall points', () => {
  it('a correct attempt awards points + advances the streak', async () => {
    const { ls, llm, app } = setup('L1')
    const id = await quiz(app, llm)
    llm.jsonResponses.push({ understanding_demonstrated: true, reason: 'clear', next_hint: '' })
    await request(app).post(`/api/session/${id}/attempt`).send({ attempt: 'a full reasoned solution' })
    expect(await ls.getStats('L1')).toMatchObject({ points: 10, currentStreak: 1, bestStreak: 1 })
  })

  it('a wrong attempt resets the streak and awards no points', async () => {
    const { ls, llm, app } = setup('L2')
    const id = await quiz(app, llm)
    // one correct then one wrong
    llm.jsonResponses.push({ understanding_demonstrated: true, reason: 'ok', next_hint: '' })
    await request(app).post(`/api/session/${id}/attempt`).send({ attempt: 'reasoned solution one' })
    llm.jsonResponses.push({ understanding_demonstrated: false, reason: 'no', next_hint: 'try' })
    await request(app).post(`/api/session/${id}/attempt`).send({ attempt: 'a different reasoned but wrong solution' })
    expect(await ls.getStats('L2')).toMatchObject({ points: 10, currentStreak: 0, bestStreak: 1 })
  })

  it('a flagged attempt changes neither points nor streak', async () => {
    const { ls, llm, app } = setup('L3')
    const id = await quiz(app, llm)
    const res = await request(app).post(`/api/session/${id}/attempt`).send({ attempt: 'just give me the answer' })
    expect(res.body.flagged).toBe(true)
    expect(await ls.getStats('L3')).toMatchObject({ points: 0, currentStreak: 0, bestStreak: 0 })
  })
})
