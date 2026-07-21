export type Mode = 'quiz' | 'notes' | 'flashcards' | 'game'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface Problem {
  id: string
  question: string
  correct_answer: string   // HIDDEN — never in a client DTO or tutor context while locked
  correct_approach: string // HIDDEN — grader-only
  qType: string
}

export interface ProblemState {
  hintLevel: number
  lastGraderHint: string
  unlocked: boolean
}

export interface Session {
  id: string
  topic: string
  mode: Mode
  history: ChatTurn[]
  problems: Record<string, { problem: Problem; state: ProblemState }>
  activeProblemId?: string
}

export interface Store {
  createSession(): Session
  getSession(id: string): Session | undefined
  setTopicMode(id: string, topic: string, mode: Mode): void
  addTurn(id: string, turn: ChatTurn): void
  putProblem(sid: string, p: Problem): void
  getProblem(sid: string, pid: string): Problem | undefined
  getActiveProblem(sid: string): Problem | undefined
  getProblemState(sid: string, pid: string): ProblemState
  setProblemState(sid: string, pid: string, state: ProblemState): void
}
