import { randomUUID } from 'node:crypto'
import type { Store, Session, Problem, ProblemState, ChatTurn, Mode, Deck } from './types'

export class MemoryStore implements Store {
  private sessions = new Map<string, Session>()

  createSession(learnerId = ''): Session {
    const s: Session = { id: randomUUID(), learnerId, topic: '', mode: 'quiz', history: [], problems: {}, personalBests: {} }
    this.sessions.set(s.id, s)
    return s
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id)
  }

  setTopicMode(id: string, topic: string, mode: Mode): void {
    const s = this.must(id); s.topic = topic; s.mode = mode
  }

  addTurn(id: string, turn: ChatTurn): void {
    this.must(id).history.push(turn)
  }

  putProblem(sid: string, p: Problem): void {
    const s = this.must(sid)
    s.problems[p.id] = { problem: p, state: { hintLevel: 0, lastGraderHint: '', unlocked: false } }
    s.activeProblemId = p.id
  }

  getProblem(sid: string, pid: string): Problem | undefined {
    return this.getSession(sid)?.problems[pid]?.problem
  }

  getActiveProblem(sid: string): Problem | undefined {
    const s = this.getSession(sid)
    return s?.activeProblemId ? s.problems[s.activeProblemId]?.problem : undefined
  }

  getProblemState(sid: string, pid: string): ProblemState {
    return this.must(sid).problems[pid].state
  }

  setProblemState(sid: string, pid: string, state: ProblemState): void {
    this.must(sid).problems[pid].state = state
  }

  putDeck(sid: string, deck: Deck): void {
    this.must(sid).deck = deck
  }

  getDeck(sid: string): Deck | undefined {
    return this.getSession(sid)?.deck
  }

  getPersonalBest(sid: string, topic: string): number | undefined {
    return this.getSession(sid)?.personalBests[topic]
  }

  setPersonalBest(sid: string, topic: string, seconds: number): void {
    this.must(sid).personalBests[topic] = seconds
  }

  private must(id: string): Session {
    const s = this.sessions.get(id)
    if (!s) throw new Error(`session ${id} not found`)
    return s
  }
}
