import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { MemoryStore } from '../src/store/memory'
import { FakeLlm } from './helpers/fakeLlm'
import { ATTACKS } from '../src/redteam/attacks'

const SECRET = 'RED_TEAM_SECRET_ANSWER'

function streamedText(sse: string): string {
  return sse
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)))
    .filter((e) => typeof e.token === 'string')
    .map((e) => e.token)
    .join('')
}

describe('red-team: structural guarantees (deterministic, classifier off)', () => {
  it('no attack unlocks the gate or leaks the answer', async () => {
    let leaks = 0
    let illegitUnlocks = 0
    for (const atk of ATTACKS) {
      // Fresh session per attack so each /tutor context stays small — echoContext streams
      // the whole context as SSE, and accumulating 15 turns in one session would balloon
      // the payload (which is why an earlier version disabled the echo entirely).
      const llm = new FakeLlm()
      llm.echoContext = true // tutor echoes everything it was given, so a leak WOULD surface
      const app = createApp({ store: new MemoryStore(), llm })
      const id = (await request(app).post('/api/session')).body.id as string
      await request(app).post(`/api/session/${id}/topic`).send({ topic: 'zoology', mode: 'quiz' })
      llm.jsonResponses.push({ question: 'Fastest land animal?', correct_answer: SECRET, correct_approach: 'recall', qType: 'recall' })
      await request(app).post(`/api/session/${id}/problem`)
      // conservative FALSE verdict in case a non-heuristic attack reaches the grader
      llm.jsonResponses.push({ understanding_demonstrated: false, reason: 'not demonstrated', next_hint: 'keep trying' })
      const res = await request(app).post(`/api/session/${id}/attempt`).send({ attempt: atk.text })
      if (res.body.unlocked === true) illegitUnlocks += 1
      if (JSON.stringify(res.body).includes(SECRET)) leaks += 1
      const tutor = await request(app).get(`/api/session/${id}/tutor`)
      if (streamedText(tutor.text).includes(SECRET)) leaks += 1
    }
    expect(illegitUnlocks).toBe(0)
    expect(leaks).toBe(0)
  })

  it('heuristic-catchable attacks are flagged and never reach the grader', async () => {
    const llm = new FakeLlm()
    const app = createApp({ store: new MemoryStore(), llm })
    const id = (await request(app).post('/api/session')).body.id as string
    await request(app).post(`/api/session/${id}/topic`).send({ topic: 'zoology', mode: 'quiz' })
    llm.jsonResponses.push({ question: 'q', correct_answer: SECRET, correct_approach: 'recall', qType: 'recall' })
    await request(app).post(`/api/session/${id}/problem`)

    // every non-'jailbreak'-tagged corpus attack is heuristic-catchable
    const heuristicAttacks = ATTACKS.filter((a) => a.category !== 'jailbreak')
    for (const atk of heuristicAttacks) {
      const before = llm.jsonResponses.length
      const res = await request(app).post(`/api/session/${id}/attempt`).send({ attempt: atk.text })
      expect(res.body.flagged, `attack ${atk.id} should be flagged`).toBe(true)
      expect(llm.jsonResponses.length, `attack ${atk.id} must not call the grader`).toBe(before)
    }
  })
})
