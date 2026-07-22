import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin, unwrap } from '../supabase'
import type { Store, Session, Problem, ProblemState, ChatTurn, Mode, Deck, Card } from './types'

interface SessionRow {
  id: string
  user_id: string
  topic: string
  mode: string
  active_problem_id: string | null
}

interface ProblemRow {
  id: string
  question: string
  correct_answer: string
  correct_approach: string
  q_type: string
  hint_level: number
  last_grader_hint: string
  unlocked: boolean
}

const toProblem = (r: ProblemRow): Problem => ({
  id: r.id, question: r.question, correct_answer: r.correct_answer,
  correct_approach: r.correct_approach, qType: r.q_type,
})

const toState = (r: ProblemRow): ProblemState => ({
  hintLevel: r.hint_level, lastGraderHint: r.last_grader_hint, unlocked: r.unlocked,
})

/**
 * Postgres-backed session store. Serverless functions are stateless, so everything the
 * gate depends on (the problem's hidden answer, hint level, unlocked flag) lives here
 * rather than in process memory. Reads go through the service-role client only.
 */
export class SupabaseStore implements Store {
  constructor(private sb: SupabaseClient = admin()) {}

  async createSession(learnerId = ''): Promise<Session> {
    const id = randomUUID()
    unwrap(await this.sb.from('study_sessions').insert({ id, user_id: learnerId, topic: '', mode: 'quiz' }))
    return { id, learnerId, topic: '', mode: 'quiz', history: [], problems: {} }
  }

  async getSession(id: string): Promise<Session | undefined> {
    // One round trip: PostgREST embeds the child rows through their foreign keys.
    const { data, error } = await this.sb
      .from('study_sessions')
      .select('id,user_id,topic,mode,active_problem_id,session_turns(role,content),problems(*),decks(topic,cards)')
      .eq('id', id)
      .order('id', { referencedTable: 'session_turns', ascending: true })
      .maybeSingle()
    // A malformed uuid is "not found", not a crash — routes 404 on undefined.
    if (error) {
      if (error.code === '22P02' || error.code === 'PGRST116') return undefined
      throw new Error(`supabase: ${error.message}`)
    }
    if (!data) return undefined

    const row = data as unknown as SessionRow & {
      session_turns: ChatTurn[]
      problems: ProblemRow[]
      decks: { topic: string; cards: Card[] }[] | { topic: string; cards: Card[] } | null
    }
    const problems: Session['problems'] = {}
    for (const p of row.problems ?? []) problems[p.id] = { problem: toProblem(p), state: toState(p) }
    const deckRow = Array.isArray(row.decks) ? row.decks[0] : row.decks

    return {
      id: row.id,
      learnerId: row.user_id,
      topic: row.topic,
      mode: row.mode as Mode,
      history: (row.session_turns ?? []).map((t) => ({ role: t.role, content: t.content })),
      problems,
      activeProblemId: row.active_problem_id ?? undefined,
      deck: deckRow ? { topic: deckRow.topic, cards: deckRow.cards } : undefined,
    }
  }

  async setTopicMode(id: string, topic: string, mode: Mode): Promise<void> {
    unwrap(await this.sb.from('study_sessions').update({ topic, mode }).eq('id', id))
  }

  async addTurn(id: string, turn: ChatTurn): Promise<void> {
    unwrap(await this.sb.from('session_turns').insert({ session_id: id, role: turn.role, content: turn.content }))
  }

  async putProblem(sid: string, p: Problem): Promise<void> {
    unwrap(
      await this.sb.from('problems').insert({
        id: p.id, session_id: sid, question: p.question, correct_answer: p.correct_answer,
        correct_approach: p.correct_approach, q_type: p.qType,
        hint_level: 0, last_grader_hint: '', unlocked: false,
      }),
    )
    unwrap(await this.sb.from('study_sessions').update({ active_problem_id: p.id }).eq('id', sid))
  }

  async getProblem(sid: string, pid: string): Promise<Problem | undefined> {
    const row = await this.problemRow(sid, pid)
    return row ? toProblem(row) : undefined
  }

  async getActiveProblem(sid: string): Promise<Problem | undefined> {
    const { data, error } = await this.sb.from('study_sessions').select('active_problem_id').eq('id', sid).maybeSingle()
    if (error || !data?.active_problem_id) return undefined
    return this.getProblem(sid, data.active_problem_id as string)
  }

  async getProblemState(sid: string, pid: string): Promise<ProblemState> {
    const row = await this.problemRow(sid, pid)
    if (!row) throw new Error(`problem ${pid} not found in session ${sid}`)
    return toState(row)
  }

  async setProblemState(sid: string, pid: string, state: ProblemState): Promise<void> {
    unwrap(
      await this.sb
        .from('problems')
        .update({ hint_level: state.hintLevel, last_grader_hint: state.lastGraderHint, unlocked: state.unlocked })
        .eq('session_id', sid)
        .eq('id', pid),
    )
  }

  async putDeck(sid: string, deck: Deck): Promise<void> {
    unwrap(
      await this.sb
        .from('decks')
        .upsert({ session_id: sid, topic: deck.topic, cards: deck.cards }, { onConflict: 'session_id' }),
    )
  }

  async getDeck(sid: string): Promise<Deck | undefined> {
    const { data, error } = await this.sb.from('decks').select('topic,cards').eq('session_id', sid).maybeSingle()
    if (error || !data) return undefined
    return { topic: data.topic as string, cards: data.cards as Card[] }
  }

  private async problemRow(sid: string, pid: string): Promise<ProblemRow | undefined> {
    const { data, error } = await this.sb.from('problems').select('*').eq('session_id', sid).eq('id', pid).maybeSingle()
    if (error || !data) return undefined
    return data as unknown as ProblemRow
  }
}
