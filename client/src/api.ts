export interface ClientProblem { id: string; question: string; qType: string }
export interface AttemptResult {
  understanding_demonstrated: boolean
  reason: string
  hintLevel: number
  unlocked: boolean
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
