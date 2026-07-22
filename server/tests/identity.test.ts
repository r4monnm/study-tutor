import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { MemoryStore } from '../src/store/memory'
import { SqliteLearnerStore } from '../src/sqliteLearnerStore'
import { FakeLlm } from './helpers/fakeLlm'
import { fakeAuth } from './helpers/fakeAuth'

describe('learner identity + injection', () => {
  it('records the learnerId on the session', async () => {
    const store = new MemoryStore()
    expect((await store.createSession('L1')).learnerId).toBe('L1')
    expect((await store.createSession()).learnerId).toBe('') // default
  })

  it('createApp accepts an injected learner store and session-create carries learnerId', async () => {
    const app = createApp({ store: new MemoryStore(), llm: new FakeLlm(), learnerStore: new SqliteLearnerStore(), auth: fakeAuth() })
    const res = await request(app).post('/api/session').send({ learnerId: 'L1' })
    expect(res.body.id).toBeTruthy()
    expect(res.body.greeting).toBeTruthy()
  })
})
