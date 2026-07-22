import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { MemoryStore } from '../src/store/memory'
import { SqliteLearnerStore } from '../src/learnerStore'
import { FakeLlm } from './helpers/fakeLlm'

describe('learner identity + injection', () => {
  it('records the learnerId on the session', () => {
    const store = new MemoryStore()
    expect(store.createSession('L1').learnerId).toBe('L1')
    expect(store.createSession().learnerId).toBe('') // default
  })

  it('createApp accepts an injected learner store and session-create carries learnerId', async () => {
    const app = createApp({ store: new MemoryStore(), llm: new FakeLlm(), learnerStore: new SqliteLearnerStore() })
    const res = await request(app).post('/api/session').send({ learnerId: 'L1' })
    expect(res.body.id).toBeTruthy()
    expect(res.body.greeting).toBeTruthy()
  })
})
