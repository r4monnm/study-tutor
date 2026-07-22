import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { MemoryStore } from '../src/store/memory'
import { SqliteLearnerStore } from '../src/learnerStore'
import { FakeLlm } from './helpers/fakeLlm'

describe('dashboard + cross-session persistence', () => {
  it('reflects points, streak, per-topic mastery, and bests from a prior session', async () => {
    const ls = new SqliteLearnerStore() // shared across both sessions
    const llm = new FakeLlm()
    const app = createApp({ store: new MemoryStore(), llm, learnerStore: ls })

    // --- Session 1: learner L1 studies flashcards and gets one right ---
    const s1 = (await request(app).post('/api/session').send({ learnerId: 'L1' })).body.id as string
    await request(app).post(`/api/session/${s1}/topic`).send({ topic: 'biology', mode: 'flashcards' })
    llm.jsonResponses.push({ cards: [{ term: 'cell', definition: 'the basic unit of life' }, { term: 'gene', definition: 'a unit of heredity' }] })
    await request(app).post(`/api/session/${s1}/deck`)
    const cardId = (await request(app).get(`/api/session/${s1}/flashcard/next`)).body.card.id
    llm.jsonResponses.push({ understanding_demonstrated: true, reason: 'correct', next_hint: '' })
    await request(app).post(`/api/session/${s1}/flashcard/${cardId}/attempt`).send({ attempt: 'the basic unit of life' })
    await request(app).post(`/api/session/${s1}/game/result`).send({ timeSeconds: 33, wrongMatches: 1 })

    // --- Session 2: SAME learner, fresh session — durable data must be visible ---
    const s2 = (await request(app).post('/api/session').send({ learnerId: 'L1' })).body.id as string
    await request(app).post(`/api/session/${s2}/topic`).send({ topic: 'biology', mode: 'flashcards' })
    const dash = await request(app).get(`/api/session/${s2}/dashboard`)

    expect(dash.body.points).toBeGreaterThan(0) // 10 (flashcard) + 11 (game, 12-1)
    expect(dash.body.currentStreak).toBeGreaterThan(0)
    expect(dash.body.bestStreak).toBeGreaterThan(0)
    const bio = dash.body.topics.find((t: { topic: string }) => t.topic === 'biology')
    expect(bio.total).toBe(2)
    expect(bio.seen).toBe(1)
    expect(bio.personalBest).toBe(33)
  })

  it('a different learner sees an empty dashboard', async () => {
    const ls = new SqliteLearnerStore()
    const app = createApp({ store: new MemoryStore(), llm: new FakeLlm(), learnerStore: ls })
    const id = (await request(app).post('/api/session').send({ learnerId: 'OTHER' })).body.id as string
    const dash = await request(app).get(`/api/session/${id}/dashboard`)
    expect(dash.body).toMatchObject({ points: 0, currentStreak: 0, bestStreak: 0, topics: [], retention: { checks: 0 } })
  })
})
