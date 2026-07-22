import 'dotenv/config'
import { describe, it, expect, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '../../src/supabase'
import { SupabaseStore } from '../../src/store/supabase'
import { SupabaseLearnerStore } from '../../src/supabaseLearnerStore'
import { storeContract } from '../helpers/storeContract'
import { learnerStoreContract } from '../helpers/learnerStoreContract'

// Hits the real Supabase project. Run with `npm run test:supabase` (needs SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY in server/.env). Every test gets a throwaway auth user, which
// is deleted afterwards — `on delete cascade` takes all of its rows with it, so the
// contracts see a clean owner exactly like a fresh in-memory store.

const sb = createAdminClient()
const createdUsers: string[] = []

async function makeUser(): Promise<string> {
  const { data, error } = await sb.auth.admin.createUser({
    email: `it-${randomUUID()}@studytutor.test`,
    password: randomUUID(),
    email_confirm: true,
  })
  if (error) throw new Error(`createUser: ${error.message}`)
  createdUsers.push(data.user.id)
  return data.user.id
}

afterAll(async () => {
  for (const id of createdUsers) await sb.auth.admin.deleteUser(id)
}, 60_000)

storeContract('SupabaseStore', async () => ({ store: new SupabaseStore(sb), learnerId: await makeUser() }))
learnerStoreContract('SupabaseLearnerStore', async () => ({ store: new SupabaseLearnerStore(sb), learnerId: await makeUser() }))

describe('leak-proof gate at the storage layer', () => {
  it('denies the browser (anon key) any read of the tables, even with a known id', async () => {
    const store = new SupabaseStore(sb)
    const session = await store.createSession(await makeUser())
    await store.putProblem(session.id, {
      id: randomUUID(), question: 'What is the capital of France?',
      correct_answer: 'Paris', correct_approach: 'recall', qType: 'recall',
    })

    const anonKey = process.env.SUPABASE_ANON_KEY
    expect(anonKey, 'SUPABASE_ANON_KEY must be set to prove the browser is locked out').toBeTruthy()
    const browser = createAdminClient(process.env.SUPABASE_URL, anonKey)

    for (const table of ['problems', 'study_sessions', 'decks', 'mastery', 'chat_messages']) {
      const { data, error } = await browser.from(table).select('*')
      // RLS on + zero policies: either an explicit denial or an empty result. Never rows.
      expect(error ? [] : data, `${table} must not be readable by the browser`).toEqual([])
    }
  })

  it('keeps the hidden answer server-side but retrievable by the server', async () => {
    const store = new SupabaseStore(sb)
    const session = await store.createSession(await makeUser())
    const id = randomUUID()
    await store.putProblem(session.id, {
      id, question: 'q', correct_answer: 'SECRET-ANSWER', correct_approach: 'SECRET-APPROACH', qType: 't',
    })
    const back = await store.getProblem(session.id, id)
    expect(back?.correct_answer).toBe('SECRET-ANSWER')
    expect(back?.correct_approach).toBe('SECRET-APPROACH')
  })
})
