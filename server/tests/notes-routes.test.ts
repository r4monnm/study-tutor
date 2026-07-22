import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { MemoryStore } from '../src/store/memory'
import { FakeLlm } from './helpers/fakeLlm'

function streamedText(sse: string): string {
  return sse
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)))
    .filter((e) => typeof e.token === 'string')
    .map((e) => e.token)
    .join('')
}

describe('notes API', () => {
  it('streams a notes chunk and records the turn', async () => {
    const llm = new FakeLlm()
    llm.streamReply = 'Chunk 1: photosynthesis converts light to energy. Quick check: what goes in?'
    const app = createApp({ store: new MemoryStore(), llm })
    const id = (await request(app).post('/api/session')).body.id as string
    await request(app).post(`/api/session/${id}/topic`).send({ topic: 'photosynthesis', mode: 'notes' })
    const res = await request(app).get(`/api/session/${id}/notes`)
    expect(streamedText(res.text)).toContain('Quick check')
  })

  it('notes context begins with a user turn even after an assistant turn is stored', async () => {
    const llm = new FakeLlm()
    llm.echoContext = true // tutor echoes system+messages so we can inspect ordering
    const app = createApp({ store: new MemoryStore(), llm })
    const id = (await request(app).post('/api/session')).body.id as string
    await request(app).post(`/api/session/${id}/topic`).send({ topic: 'x', mode: 'notes' })
    await request(app).get(`/api/session/${id}/notes`) // stores an assistant turn
    await request(app).post(`/api/session/${id}/notes/say`).send({ text: 'ready' })
    const res = await request(app).get(`/api/session/${id}/notes`)
    const ctx = JSON.parse(streamedText(res.text))
    expect(ctx.messages[0].role).toBe('user')
  })
})
