import { useEffect, useState } from 'react'
import { reviewDue, reviewAttempt, type DueItem, type ReviewResult } from '../api'

export default function ReviewView({ sessionId }: { sessionId: string }) {
  const [items, setItems] = useState<DueItem[] | null>(null)
  const [i, setI] = useState(0)
  const [attempt, setAttempt] = useState('')
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { reviewDue(sessionId).then(setItems) }, [sessionId])

  if (!items) return <div className="text-slate-500">Loading…</div>
  if (items.length === 0) return <div className="text-slate-500">Nothing due for review yet — come back after a while to test what stuck.</div>
  if (i >= items.length) return <div className="text-slate-600">Review complete! 🎉</div>

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
      <div className="text-sm text-slate-500">Reviewing {i + 1} of {items.length} due — <span className="capitalize">{cur.topic}</span></div>
      <div className="rounded-xl border bg-white p-6 text-center">
        <div className="text-xs uppercase tracking-wide text-slate-400">Do you still remember?</div>
        <div className="mt-2 text-xl font-semibold">{cur.term}</div>
      </div>
      {!result ? (
        <div className="flex gap-2">
          <input className="flex-1 rounded-lg border bg-white px-3 py-2" placeholder="Type what you remember…" value={attempt}
            onChange={(e) => setAttempt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commit()} disabled={busy} />
          <button className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={commit} disabled={busy}>Check</button>
        </div>
      ) : result.flagged ? (
        <div className="flex flex-col gap-3">
          <div className="text-slate-600">{result.redirect}</div>
          <button className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-white" onClick={() => setResult(null)}>Try again</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className={`self-start rounded-lg px-3 py-1 text-sm font-medium ${result.held ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {result.held ? 'Held ✓' : 'Lapsed ✗'}{result.delayMs != null && ` · ${Math.round(result.delayMs / 3600000)}h since last seen`}
          </div>
          <div className="rounded-xl border bg-white p-4"><span className="text-slate-400">Back: </span>{result.back}</div>
          <button className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-white" onClick={next}>Next</button>
        </div>
      )}
    </div>
  )
}
