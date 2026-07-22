import { useEffect, useState } from 'react'
import { reviewDue, reviewAttempt, type DueItem, type ReviewResult } from '../api'

export default function ReviewView({ sessionId }: { sessionId: string }) {
  const [items, setItems] = useState<DueItem[] | null>(null)
  const [i, setI] = useState(0)
  const [attempt, setAttempt] = useState('')
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { reviewDue(sessionId).then(setItems) }, [sessionId])

  if (!items) return <div className="muted">Loading…</div>
  if (items.length === 0) return <div className="muted">Nothing due for review yet — come back after a while to test what stuck.</div>
  if (i >= items.length) return <div className="muted">Review complete! 🎉</div>

  const cur = items[i]
  async function commit() {
    if (!attempt.trim() || busy) return
    setBusy(true)
    setResult(await reviewAttempt(sessionId, cur.topic, cur.term, attempt))
    setBusy(false)
  }
  function next() { setResult(null); setAttempt(''); setI(i + 1) }

  return (
    <div className="flex flex-col gap-4">
      <div className="muted text-sm">Reviewing {i + 1} of {items.length} due — <span className="capitalize">{cur.topic}</span></div>
      <div className="glass p-6 text-center">
        <div className="dim text-xs uppercase tracking-wide">Do you still remember?</div>
        <div className="brand mt-2 text-xl font-semibold">{cur.term}</div>
      </div>
      {!result ? (
        <div className="flex gap-2">
          <input className="field flex-1" placeholder="Type what you remember…" value={attempt}
            onChange={(e) => setAttempt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commit()} disabled={busy} />
          <button className="btn" onClick={commit} disabled={busy}>Check</button>
        </div>
      ) : result.flagged ? (
        <div className="flex flex-col gap-3">
          <div className="muted">{result.redirect}</div>
          <button className="btn self-start" onClick={() => setResult(null)}>Try again</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className={`pill self-start ${result.held ? 'pill-unlock' : 'pill-lock'}`}>
            {result.held ? 'Held ✓' : 'Lapsed ✗'}{result.delayMs != null && ` · ${Math.round(result.delayMs / 3600000)}h since last seen`}
          </div>
          <div className="glass p-4"><span className="dim">Back: </span>{result.back}</div>
          <button className="btn self-start" onClick={next}>Next</button>
        </div>
      )}
    </div>
  )
}
