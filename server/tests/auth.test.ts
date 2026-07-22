import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { MemoryStore } from '../src/store/memory'
import { FakeLlm } from './helpers/fakeLlm'
import { fakeAuth } from './helpers/fakeAuth'
import { bearerToken } from '../src/auth'

const strict = { tokens: { tokA: 'userA', tokB: 'userB' } }

function app() {
  return createApp({ store: new MemoryStore(), llm: new FakeLlm(), auth: fakeAuth(strict) })
}

describe('bearerToken', () => {
  it('extracts the token from a Bearer header', () => {
    expect(bearerToken('Bearer abc123')).toBe('abc123')
    expect(bearerToken('bearer abc123')).toBe('abc123') // scheme is case-insensitive
  })

  it('rejects anything that is not a non-empty Bearer token', () => {
    expect(bearerToken(undefined)).toBeUndefined()
    expect(bearerToken('')).toBeUndefined()
    expect(bearerToken('abc123')).toBeUndefined()      // no scheme
    expect(bearerToken('Basic abc123')).toBeUndefined() // wrong scheme
    expect(bearerToken('Bearer ')).toBeUndefined()      // empty token
  })
})

describe('API requires a valid session token', () => {
  it('401s an unauthenticated request', async () => {
    const res = await request(app()).post('/api/session')
    expect(res.status).toBe(401)
  })

  it('401s a request with an invalid token', async () => {
    const res = await request(app()).post('/api/session').set('Authorization', 'Bearer nope')
    expect(res.status).toBe(401)
  })

  it('lets a valid token through and owns the session by the token, not the body', async () => {
    const a = app()
    // The body tries to claim someone else's identity; the token must win.
    const res = await request(a).post('/api/session').set('Authorization', 'Bearer tokA').send({ learnerId: 'userB' })
    expect(res.status).toBe(200)
    expect(res.body.id).toBeTruthy()
  })
})

describe('sessions are scoped to their owner', () => {
  it("404s when another user targets someone else's session", async () => {
    const a = app()
    const created = await request(a).post('/api/session').set('Authorization', 'Bearer tokA')
    const id = created.body.id as string

    // userA can reach it...
    expect((await request(a).post(`/api/session/${id}/topic`).set('Authorization', 'Bearer tokA').send({ topic: 'bio', mode: 'quiz' })).status).toBe(200)
    // ...userB cannot, even holding the exact session id.
    for (const call of [
      request(a).post(`/api/session/${id}/topic`).set('Authorization', 'Bearer tokB').send({ topic: 'hijack', mode: 'quiz' }),
      request(a).post(`/api/session/${id}/problem`).set('Authorization', 'Bearer tokB'),
      request(a).post(`/api/session/${id}/attempt`).set('Authorization', 'Bearer tokB').send({ attempt: 'x' }),
      request(a).get(`/api/session/${id}/dashboard`).set('Authorization', 'Bearer tokB'),
      request(a).get(`/api/session/${id}/mastery`).set('Authorization', 'Bearer tokB'),
    ]) {
      expect((await call).status).toBe(404)
    }
  })

  it('404s the SSE stream for a non-owner', async () => {
    const a = app()
    const created = await request(a).post('/api/session').set('Authorization', 'Bearer tokA')
    const id = created.body.id as string
    expect((await request(a).get(`/api/session/${id}/tutor`).set('Authorization', 'Bearer tokB')).status).toBe(404)
  })
})
