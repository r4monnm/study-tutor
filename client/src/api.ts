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
  return (await fetch('/api/session', { method: 'POST' })).json()
}

export async function setTopic(id: string, topic: string, mode: string): Promise<void> {
  await fetch(`/api/session/${id}/topic`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic, mode }),
  })
}

export async function newProblem(id: string): Promise<ClientProblem> {
  const res = await fetch(`/api/session/${id}/problem`, { method: 'POST' })
  return (await res.json()).problem
}

export async function submitAttempt(id: string, attempt: string): Promise<AttemptResult> {
  const res = await fetch(`/api/session/${id}/attempt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ attempt }),
  })
  return res.json()
}

// Streams the tutor turn over SSE. Calls onToken per token; resolves on done.
export function streamTutor(
  id: string,
  onToken: (t: string) => void,
  onDone: (unlocked: boolean) => void,
): void {
  const es = new EventSource(`/api/session/${id}/tutor`)
  es.onmessage = (e) => {
    const data = JSON.parse(e.data)
    if (data.token) onToken(data.token)
    if (data.done) {
      onDone(!!data.unlocked)
      es.close()
    }
  }
  es.onerror = () => es.close()
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
  return (await fetch(`/api/session/${id}/deck`, { method: 'POST' })).json()
}
export async function nextCard(id: string): Promise<CardFront> {
  return (await (await fetch(`/api/session/${id}/flashcard/next`)).json()).card
}
export async function gradeCard(id: string, cardId: string, attempt: string): Promise<FlashcardResult> {
  const res = await fetch(`/api/session/${id}/flashcard/${cardId}/attempt`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attempt }),
  })
  return res.json()
}
export async function masterySummary(id: string): Promise<MasterySummary> {
  return (await fetch(`/api/session/${id}/mastery`)).json()
}
export async function gameBoard(id: string): Promise<Tile[]> {
  return (await (await fetch(`/api/session/${id}/game/board`)).json()).tiles
}
export async function gameResult(id: string, timeSeconds: number): Promise<{ personalBest: number; isNewBest: boolean }> {
  const res = await fetch(`/api/session/${id}/game/result`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ timeSeconds }),
  })
  return res.json()
}
export async function notesSay(id: string, text: string): Promise<{ ok?: boolean; flagged?: boolean; redirect?: string }> {
  const res = await fetch(`/api/session/${id}/notes/say`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }),
  })
  return res.json()
}
export function streamNotes(id: string, onToken: (t: string) => void, onDone: () => void): void {
  const es = new EventSource(`/api/session/${id}/notes`)
  es.onmessage = (e) => {
    const data = JSON.parse(e.data)
    if (data.token) onToken(data.token)
    if (data.done) { onDone(); es.close() }
  }
  es.onerror = () => es.close()
}
