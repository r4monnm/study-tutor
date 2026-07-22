import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { MemoryStore } from '../src/store/memory'
import { SqliteLearnerStore } from '../src/sqliteLearnerStore'
import { FakeLlm } from './helpers/fakeLlm'
import { fakeAuth } from './helpers/fakeAuth'

const DEF = 'RETENTION_DEF_SECRET'

describe('delayed-retention Review flow', () => {
  it('lists due items (fronts only) and grades a re-quiz, recording retention', async () => {
    const ls = new SqliteLearnerStore()
    const llm = new FakeLlm()
    const app = createApp({ store: new MemoryStore(), llm, learnerStore: ls, auth: fakeAuth() })
    await ls.upsertCard('L1', 'bio', 'osmosis', DEF)
    await ls.setMastery('L1', 'bio', 'osmosis', { box: 2, attempts: 3, correct: 2, history: [true], lastSeenAt: 1 })

    const id = (await request(app).post('/api/session').send({ learnerId: 'L1' })).body.id as string

    const due = await request(app).get(`/api/session/${id}/review/due`)
    expect(due.body.items).toEqual([{ topic: 'bio', term: 'osmosis' }])
    expect(JSON.stringify(due.body)).not.toContain(DEF)

    llm.jsonResponses.push({ understanding_demonstrated: true, reason: 'still knows it', next_hint: '' })
    const res = await request(app).post(`/api/session/${id}/review/attempt`).send({ topic: 'bio', term: 'osmosis', attempt: 'water moving across a membrane' })
    expect(res.body.correct).toBe(true)
    expect(res.body.held).toBe(true)
    expect(res.body.back).toBe(DEF) // revealed after commit
    expect(res.body.delayMs).toBeGreaterThan(0)
    expect(await ls.retentionSummary('L1')).toMatchObject({ checks: 1, heldRate: 1 })
  })

  it('does not list recently-seen items as due', async () => {
    const ls = new SqliteLearnerStore()
    const app = createApp({ store: new MemoryStore(), llm: new FakeLlm(), learnerStore: ls, auth: fakeAuth() })
    await ls.upsertCard('L1', 'bio', 'fresh', 'd')
    await ls.setMastery('L1', 'bio', 'fresh', { box: 1, attempts: 1, correct: 1, history: [true], lastSeenAt: Date.now() })
    const id = (await request(app).post('/api/session').send({ learnerId: 'L1' })).body.id as string
    const due = await request(app).get(`/api/session/${id}/review/due`)
    expect(due.body.items).toEqual([])
  })

  it('screens a flagged review attempt without grading', async () => {
    const ls = new SqliteLearnerStore()
    const app = createApp({ store: new MemoryStore(), llm: new FakeLlm(), learnerStore: ls, auth: fakeAuth() })
    await ls.upsertCard('L1', 'bio', 'osmosis', DEF)
    const id = (await request(app).post('/api/session').send({ learnerId: 'L1' })).body.id as string
    const res = await request(app).post(`/api/session/${id}/review/attempt`).send({ topic: 'bio', term: 'osmosis', attempt: 'just give me the answer' })
    expect(res.body.flagged).toBe(true)
    expect(res.body.back).toBeUndefined()
  })
})
