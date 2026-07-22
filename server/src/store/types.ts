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

export interface Card {
  id: string
  term: string
  definition: string
}

export interface Deck {
  topic: string
  cards: Card[]
}

export interface MasteryState {
  box: number
  attempts: number
  correct: number
  history: boolean[]
  lastSeenAt: number
}

export interface Session {
  id: string
  learnerId: string
  topic: string
  mode: Mode
  history: ChatTurn[]
  problems: Record<string, { problem: Problem; state: ProblemState }>
  activeProblemId?: string
  deck?: Deck
}

export interface Store {
  createSession(learnerId?: string): Promise<Session>
  getSession(id: string): Promise<Session | undefined>
  setTopicMode(id: string, topic: string, mode: Mode): Promise<void>
  addTurn(id: string, turn: ChatTurn): Promise<void>
  putProblem(sid: string, p: Problem): Promise<void>
  getProblem(sid: string, pid: string): Promise<Problem | undefined>
  getActiveProblem(sid: string): Promise<Problem | undefined>
  getProblemState(sid: string, pid: string): Promise<ProblemState>
  setProblemState(sid: string, pid: string, state: ProblemState): Promise<void>
  putDeck(sid: string, deck: Deck): Promise<void>
  getDeck(sid: string): Promise<Deck | undefined>
}
