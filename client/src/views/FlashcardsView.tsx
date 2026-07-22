import { useEffect, useState } from 'react'
import { nextCard, gradeCard, masterySummary, type CardFront, type FlashcardResult, type MasterySummary } from '../api'

export default function FlashcardsView({ sessionId }: { sessionId: string }) {
  const [card, setCard] = useState<CardFront | null>(null)
  const [attempt, setAttempt] = useState('')
  const [result, setResult] = useState<FlashcardResult | null>(null)
  const [summary, setSummary] = useState<MasterySummary | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setResult(null); setAttempt('')
    setCard(await nextCard(sessionId))
    setSummary(await masterySummary(sessionId))
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function commit() {
    if (!card || !attempt.trim() || busy) return
    setBusy(true)
    const r = await gradeCard(sessionId, card.id, attempt)
    setResult(r)
    if (!r.flagged) setSummary(await masterySummary(sessionId))
    setBusy(false)
  }

  if (!card) return <div className="text-slate-500">Loading deck…</div>
  return (
    <div className="flex flex-col gap-4">
      {summary && (
        <div className="text-sm text-slate-500">Mastered {summary.mastered}/{summary.total} · seen {summary.seen}</div>
      )}
      <div className="rounded-xl border bg-white p-6 text-center">
        <div className="text-xs uppercase tracking-wide text-slate-400">Recall the definition</div>
        <div className="mt-2 text-xl font-semibold">{card.term}</div>
      </div>
      {!result ? (
        <div className="flex gap-2">
          <input className="flex-1 rounded-lg border bg-white px-3 py-2" placeholder="Type what you remember…"
            value={attempt} onChange={(e) => setAttempt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commit()} disabled={busy} />
          <button className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={commit} disabled={busy}>Reveal</button>
        </div>
      ) : result.flagged ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700 self-start">Nice try 😄</div>
          <div className="text-slate-600">{result.redirect}</div>
          <button className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-white" onClick={() => { setResult(null); setAttempt('') }}>Try again</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className={`rounded-lg px-3 py-1 text-sm font-medium self-start ${result.correct ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {result.correct ? 'Recalled ✓' : 'Not yet ✗'} · box {result.box}{result.mastered ? ' · mastered 🏆' : ''}
          </div>
          <div className="rounded-xl border bg-white p-4"><span className="text-slate-400">Back: </span>{result.back}</div>
          <div className="text-sm text-slate-500">{result.reason}</div>
          <button className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-white" onClick={load}>Next card</button>
        </div>
      )}
    </div>
  )
}
