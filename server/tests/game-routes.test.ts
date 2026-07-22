import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { MemoryStore } from '../src/store/memory'
import { FakeLlm } from './helpers/fakeLlm'

async function sessionWithDeck(app: ReturnType<typeof createApp>, llm: FakeLlm) {
  const id = (await request(app).post('/api/session')).body.id as string
  await request(app).post(`/api/session/${id}/topic`).send({ topic: 'geography', mode: 'game' })
  llm.jsonResponses.push({
    cards: Array.from({ length: 8 }, (_, i) => ({ term: `T${i}`, definition: `D${i}` })),
  })
  return id
}

describe('game API', () => {
  it('board has 12 tiles (6 term + 6 def) from 6 cards', async () => {
    const llm = new FakeLlm()
    const app = createApp({ store: new MemoryStore(), llm })
    const id = await sessionWithDeck(app, llm)
    const res = await request(app).get(`/api/session/${id}/game/board`)
    expect(res.body.tiles).toHaveLength(12)
    expect(res.body.tiles.filter((t: { kind: string }) => t.kind === 'term')).toHaveLength(6)
    expect(res.body.tiles.filter((t: { kind: string }) => t.kind === 'def')).toHaveLength(6)
  })

  it('records a personal best and reports improvements', async () => {
    const llm = new FakeLlm()
    const app = createApp({ store: new MemoryStore(), llm })
    const id = await sessionWithDeck(app, llm)
    let res = await request(app).post(`/api/session/${id}/game/result`).send({ timeSeconds: 40, wrongMatches: 0 })
    expect(res.body.personalBest).toBe(40); expect(res.body.isNewBest).toBe(true); expect(res.body.points).toBe(12)
    res = await request(app).post(`/api/session/${id}/game/result`).send({ timeSeconds: 30, wrongMatches: 3 })
    expect(res.body.personalBest).toBe(30); expect(res.body.isNewBest).toBe(true); expect(res.body.points).toBe(9)
    res = await request(app).post(`/api/session/${id}/game/result`).send({ timeSeconds: 55, wrongMatches: 0 })
    expect(res.body.personalBest).toBe(30); expect(res.body.isNewBest).toBe(false)
  })
})
