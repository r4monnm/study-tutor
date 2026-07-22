import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { MemoryStore } from '../src/store/memory'
import { MemoryChatStore, MAX_MESSAGE_CHARS } from '../src/chatStore'
import { FakeLlm } from './helpers/fakeLlm'
import { fakeAuth } from './helpers/fakeAuth'

const strict = { tokens: { tokA: 'userA', tokB: 'userB' } }

function app(chatStore = new MemoryChatStore()) {
  return {
    app: createApp({ store: new MemoryStore(), llm: new FakeLlm(), chatStore, auth: fakeAuth(strict) }),
    chatStore,
  }
}

describe('chat history', () => {
  it('starts empty and returns what was appended, in order', async () => {
    const { app: a } = app()
    expect((await request(a).get('/api/chat').set('Authorization', 'Bearer tokA')).body.messages).toEqual([])

    await request(a).post('/api/chat').set('Authorization', 'Bearer tokA').send({ role: 'you', text: 'first' })
    await request(a).post('/api/chat').set('Authorization', 'Bearer tokA').send({ role: 'tutor', text: 'second' })

    const res = await request(a).get('/api/chat').set('Authorization', 'Bearer tokA')
    expect(res.body.messages).toEqual([
      { role: 'you', text: 'first' },
      { role: 'tutor', text: 'second' },
    ])
  })

  it('keeps each account’s thread private', async () => {
    const { app: a } = app()
    await request(a).post('/api/chat').set('Authorization', 'Bearer tokA').send({ role: 'you', text: 'A only' })
    const res = await request(a).get('/api/chat').set('Authorization', 'Bearer tokB')
    expect(res.body.messages).toEqual([])
  })

  it('401s without a token', async () => {
    const { app: a } = app()
    expect((await request(a).get('/api/chat')).status).toBe(401)
    expect((await request(a).post('/api/chat').send({ role: 'you', text: 'x' })).status).toBe(401)
  })

  it('rejects an unknown role', async () => {
    const { app: a } = app()
    const res = await request(a).post('/api/chat').set('Authorization', 'Bearer tokA').send({ role: 'admin', text: 'x' })
    expect(res.status).toBe(400)
    expect((await request(a).get('/api/chat').set('Authorization', 'Bearer tokA')).body.messages).toEqual([])
  })

  it('rejects an oversized message rather than storing it', async () => {
    const { app: a } = app()
    const res = await request(a).post('/api/chat').set('Authorization', 'Bearer tokA')
      .send({ role: 'you', text: 'x'.repeat(MAX_MESSAGE_CHARS + 1) })
    expect(res.status).toBe(400)
    expect((await request(a).get('/api/chat').set('Authorization', 'Bearer tokA')).body.messages).toEqual([])
  })

  it('clears only the caller’s thread', async () => {
    const { app: a } = app()
    await request(a).post('/api/chat').set('Authorization', 'Bearer tokA').send({ role: 'you', text: 'A' })
    await request(a).post('/api/chat').set('Authorization', 'Bearer tokB').send({ role: 'you', text: 'B' })

    expect((await request(a).delete('/api/chat').set('Authorization', 'Bearer tokA')).status).toBe(200)
    expect((await request(a).get('/api/chat').set('Authorization', 'Bearer tokA')).body.messages).toEqual([])
    expect((await request(a).get('/api/chat').set('Authorization', 'Bearer tokB')).body.messages).toEqual([{ role: 'you', text: 'B' }])
  })
})
