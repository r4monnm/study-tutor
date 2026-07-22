import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { MemoryStore } from '../src/store/memory'
import { FakeLlm } from './helpers/fakeLlm'

const DEF = 'PHOTOSYNTHESIS_DEF_SECRET'

async function sessionWithDeck(app: ReturnType<typeof createApp>, llm: FakeLlm) {
  const id = (await request(app).post('/api/session')).body.id as string
  await request(app).post(`/api/session/${id}/topic`).send({ topic: 'biology', mode: 'flashcards' })
  llm.jsonResponses.push({
    cards: [
      { term: 'photosynthesis', definition: DEF },
      { term: 'mitochondria', definition: 'the powerhouse of the cell' },
    ],
  })
  await request(app).post(`/api/session/${id}/deck`)
  return id
}

describe('flashcards API', () => {
  it('next returns the front only — never the definition', async () => {
    const llm = new FakeLlm()
    const app = createApp({ store: new MemoryStore(), llm })
    const id = await sessionWithDeck(app, llm)
    const res = await request(app).get(`/api/session/${id}/flashcard/next`)
    expect(JSON.stringify(res.body)).not.toContain(DEF)
    expect(res.body.card.term).toBeTruthy()
    expect(res.body.card.definition).toBeUndefined()
  })

  it('a graded-correct attempt reveals the back and advances the box', async () => {
    const llm = new FakeLlm()
    const app = createApp({ store: new MemoryStore(), llm })
    const id = await sessionWithDeck(app, llm)
    const cardId = (await request(app).get(`/api/session/${id}/flashcard/next`)).body.card.id
    llm.jsonResponses.push({ understanding_demonstrated: true, reason: 'correct recall', next_hint: '' })
    const res = await request(app).post(`/api/session/${id}/flashcard/${cardId}/attempt`).send({ attempt: 'the process plants use to make food from light' })
    expect(res.body.correct).toBe(true)
    expect(res.body.back).toBe(DEF) // revealed after commit
    expect(res.body.box).toBe(1)
    expect(res.body.mastered).toBe(false)
  })

  it('a graded-wrong attempt reveals the back but keeps the box at 0', async () => {
    const llm = new FakeLlm()
    const app = createApp({ store: new MemoryStore(), llm })
    const id = await sessionWithDeck(app, llm)
    const cardId = (await request(app).get(`/api/session/${id}/flashcard/next`)).body.card.id
    llm.jsonResponses.push({ understanding_demonstrated: false, reason: 'no recall', next_hint: 'think about light' })
    const res = await request(app).post(`/api/session/${id}/flashcard/${cardId}/attempt`).send({ attempt: 'idk' })
    expect(res.body.correct).toBe(false)
    expect(res.body.back).toBe(DEF)
    expect(res.body.box).toBe(0)
  })

  it('mastery summary reports deck size and seen count', async () => {
    const llm = new FakeLlm()
    const app = createApp({ store: new MemoryStore(), llm })
    const id = await sessionWithDeck(app, llm)
    const cardId = (await request(app).get(`/api/session/${id}/flashcard/next`)).body.card.id
    llm.jsonResponses.push({ understanding_demonstrated: true, reason: 'ok', next_hint: '' })
    await request(app).post(`/api/session/${id}/flashcard/${cardId}/attempt`).send({ attempt: 'x' })
    const res = await request(app).get(`/api/session/${id}/mastery`)
    expect(res.body.total).toBe(2)
    expect(res.body.seen).toBe(1)
    expect(res.body.mastered).toBe(0)
  })
})
