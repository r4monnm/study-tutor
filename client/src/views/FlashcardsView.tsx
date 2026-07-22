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

  if (!card) return <div className="muted">Loading deck…</div>
  return (
    <div className="flex flex-col gap-4">
      {summary && (
        <div className="muted text-sm">Mastered {summary.mastered}/{summary.total} · seen {summary.seen}</div>
      )}
      <div className="glass p-6 text-center">
        <div className="dim text-xs uppercase tracking-wide">Recall the definition</div>
        <div className="brand mt-2 text-xl font-semibold">{card.term}</div>
      </div>
      {!result ? (
        <div className="flex gap-2">
          <input className="field flex-1" placeholder="Type what you remember…"
            value={attempt} onChange={(e) => setAttempt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commit()} disabled={busy} />
          <button className="btn" onClick={commit} disabled={busy}>Reveal</button>
        </div>
      ) : result.flagged ? (
        <div className="flex flex-col gap-3">
          <div className="pill pill-lock self-start">Nice try 😄</div>
          <div className="muted">{result.redirect}</div>
          <button className="btn self-start" onClick={() => { setResult(null); setAttempt('') }}>Try again</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className={`pill self-start ${result.correct ? 'pill-unlock' : 'pill-lock'}`}>
            {result.correct ? 'Recalled ✓' : 'Not yet ✗'} · box {result.box}{result.mastered ? ' · mastered 🏆' : ''}
          </div>
          <div className="glass p-4"><span className="dim">Back: </span>{result.back}</div>
          <div className="muted text-sm">{result.reason}</div>
          <button className="btn self-start" onClick={load}>Next card</button>
        </div>
      )}
    </div>
  )
}
