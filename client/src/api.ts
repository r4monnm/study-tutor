import { accessToken } from './lib/supabase'

// Every call carries the signed-in user's Supabase access token; the API rejects
// anything else with a 401. Identity is never sent in a request body — the server
// derives the learner from the verified token.
async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await accessToken()
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: await authHeaders(body === undefined ? {} : { 'content-type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return res.json()
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: await authHeaders() })
  return res.json()
}

/**
 * SSE over fetch rather than EventSource: EventSource cannot set an Authorization
 * header, and putting the access token in the URL would leak it into logs and history.
 * Reads `data: {...}` frames off the body stream and hands each parsed event to onEvent.
 */
async function streamSse(path: string, onEvent: (e: Record<string, unknown>) => void): Promise<void> {
  const res = await fetch(path, { headers: await authHeaders() })
  if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // Frames are separated by a blank line; keep any partial frame in the buffer.
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data: ')) continue
        try {
          onEvent(JSON.parse(line.slice('data: '.length)))
        } catch {
          // A malformed frame is not worth killing the stream over.
        }
      }
    }
  }
}

// --- The visible thread, stored per account so it survives sign-out ---

export type ChatRole = 'tutor' | 'you' | 'system'
export interface ChatMessage { role: ChatRole; text: string }

export async function loadChat(): Promise<ChatMessage[]> {
  return (await get<{ messages: ChatMessage[] }>('/api/chat')).messages
}
/** Fire-and-forget: a failed save must never interrupt the conversation. */
export function appendChat(role: ChatRole, text: string): void {
  void post('/api/chat', { role, text }).catch(() => {})
}
export async function clearChat(): Promise<void> {
  await fetch('/api/chat', { method: 'DELETE', headers: await authHeaders() })
}

export interface ClientProblem { id: string; question: string; qType: string }
export interface AttemptResult {
  understanding_demonstrated?: boolean
  reason?: string
  hintLevel: number
  unlocked: boolean
  flagged?: boolean
  redirect?: string
  category?: string
}

export async function createSession(): Promise<{ id: string; greeting: string }> {
  return post('/api/session')
}

export async function setTopic(id: string, topic: string, mode: string): Promise<void> {
  await post(`/api/session/${id}/topic`, { topic, mode })
}

export async function newProblem(id: string): Promise<ClientProblem> {
  return (await post<{ problem: ClientProblem }>(`/api/session/${id}/problem`)).problem
}

export async function submitAttempt(id: string, attempt: string): Promise<AttemptResult> {
  return post(`/api/session/${id}/attempt`, { attempt })
}

// Streams the tutor turn over SSE. Calls onToken per token; resolves on done.
export function streamTutor(
  id: string,
  onToken: (t: string) => void,
  onDone: (unlocked: boolean) => void,
): void {
  let done = false
  let unlocked = false
  const finish = () => { if (done) return; done = true; onDone(unlocked) }
  streamSse(`/api/session/${id}/tutor`, (e) => {
    if (typeof e.token === 'string') onToken(e.token)
    if (e.done) { unlocked = !!e.unlocked; finish() }
  })
    .then(finish)   // stream ended without a done frame
    .catch(finish)  // a stream error still resolves, so the UI never hangs
}

// --- Stage 2 helpers (Notes / Flashcards / Game) ---

export interface CardFront { id: string; term: string }
export interface FlashcardResult {
  back?: string
  correct?: boolean
  reason?: string
  box: number
  mastered: boolean
  flagged?: boolean
  redirect?: string
  category?: string
}
export interface MasterySummary { total: number; mastered: number; seen: number }
export interface Tile { cardId: string; kind: 'term' | 'def'; text: string }

export async function ensureDeck(id: string): Promise<{ count: number }> {
  return post(`/api/session/${id}/deck`)
}
export async function nextCard(id: string): Promise<CardFront> {
  return (await get<{ card: CardFront }>(`/api/session/${id}/flashcard/next`)).card
}
export async function gradeCard(id: string, cardId: string, attempt: string): Promise<FlashcardResult> {
  return post(`/api/session/${id}/flashcard/${cardId}/attempt`, { attempt })
}
export async function masterySummary(id: string): Promise<MasterySummary> {
  return get(`/api/session/${id}/mastery`)
}
export async function gameBoard(id: string): Promise<Tile[]> {
  return (await get<{ tiles: Tile[] }>(`/api/session/${id}/game/board`)).tiles
}
export async function gameResult(id: string, timeSeconds: number, wrongMatches: number): Promise<{ personalBest: number; isNewBest: boolean; points?: number }> {
  return post(`/api/session/${id}/game/result`, { timeSeconds, wrongMatches })
}
export async function notesSay(id: string, text: string): Promise<{ ok?: boolean; flagged?: boolean; redirect?: string }> {
  return post(`/api/session/${id}/notes/say`, { text })
}
export function streamNotes(id: string, onToken: (t: string) => void, onDone: () => void): void {
  let done = false
  const finish = () => { if (done) return; done = true; onDone() }
  streamSse(`/api/session/${id}/notes`, (e) => {
    if (typeof e.token === 'string') onToken(e.token)
    if (e.done) finish()
  })
    .then(finish)
    .catch(finish)
}

// --- Stage 4 helpers (Dashboard, Review) ---

export interface Dashboard {
  points: number; currentStreak: number; bestStreak: number
  topics: { topic: string; mastered: number; total: number; seen: number; personalBest?: number }[]
  retention: { checks: number; heldRate: number; avgDelayMs: number }
}
export interface DueItem { topic: string; term: string }
export interface ReviewResult { back?: string; correct?: boolean; held?: boolean; delayMs?: number; box?: number; mastered?: boolean; flagged?: boolean; redirect?: string }

export async function getDashboard(id: string): Promise<Dashboard> {
  return get(`/api/session/${id}/dashboard`)
}
export async function reviewDue(id: string): Promise<DueItem[]> {
  return (await get<{ items: DueItem[] }>(`/api/session/${id}/review/due`)).items
}
export async function reviewAttempt(id: string, topic: string, term: string, attempt: string): Promise<ReviewResult> {
  return post(`/api/session/${id}/review/attempt`, { topic, term, attempt })
}
