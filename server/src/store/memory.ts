import { randomUUID } from 'node:crypto'
import type { Store, Session, Problem, ProblemState, ChatTurn, Mode, Deck } from './types'

export class MemoryStore implements Store {
  private sessions = new Map<string, Session>()

  async createSession(learnerId = ''): Promise<Session> {
    const s: Session = { id: randomUUID(), learnerId, topic: '', mode: 'quiz', history: [], problems: {} }
    this.sessions.set(s.id, s)
    return s
  }

  async getSession(id: string): Promise<Session | undefined> {
    return this.sessions.get(id)
  }

  async setTopicMode(id: string, topic: string, mode: Mode): Promise<void> {
    const s = this.must(id); s.topic = topic; s.mode = mode
  }

  async addTurn(id: string, turn: ChatTurn): Promise<void> {
    this.must(id).history.push(turn)
  }

  async putProblem(sid: string, p: Problem): Promise<void> {
    const s = this.must(sid)
    s.problems[p.id] = { problem: p, state: { hintLevel: 0, lastGraderHint: '', unlocked: false } }
    s.activeProblemId = p.id
  }

  async getProblem(sid: string, pid: string): Promise<Problem | undefined> {
    return this.sessions.get(sid)?.problems[pid]?.problem
  }

  async getActiveProblem(sid: string): Promise<Problem | undefined> {
    const s = this.sessions.get(sid)
    return s?.activeProblemId ? s.problems[s.activeProblemId]?.problem : undefined
  }

  async getProblemState(sid: string, pid: string): Promise<ProblemState> {
    return this.must(sid).problems[pid].state
  }

  async setProblemState(sid: string, pid: string, state: ProblemState): Promise<void> {
    this.must(sid).problems[pid].state = state
  }

  async putDeck(sid: string, deck: Deck): Promise<void> {
    this.must(sid).deck = deck
  }

  async getDeck(sid: string): Promise<Deck | undefined> {
    return this.sessions.get(sid)?.deck
  }

  private must(id: string): Session {
    const s = this.sessions.get(id)
    if (!s) throw new Error(`session ${id} not found`)
    return s
  }
}
