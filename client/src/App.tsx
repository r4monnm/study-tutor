import { useEffect, useRef, useState } from 'react'
import Markdown from './components/Markdown'
import {
  createSession, setTopic, newProblem, submitAttempt, streamTutor,
  notesSay, streamNotes, nextCard, gradeCard, reviewDue, reviewAttempt,
  type DueItem,
} from './api'
import GameView from './views/GameView'
import DashboardView from './views/DashboardView'

type Mode = 'quiz' | 'notes' | 'flashcards' | 'review'
type Overlay = 'game' | 'dashboard' | null
interface Msg { role: 'tutor' | 'you' | 'system'; text: string }

const CHIPS: { m: Mode | 'game' | 'dashboard'; label: string }[] = [
  { m: 'quiz', label: '🎯 Quiz' },
  { m: 'notes', label: '📖 Notes' },
  { m: 'flashcards', label: '🃏 Flashcards' },
  { m: 'review', label: '🔁 Review' },
  { m: 'game', label: '🎮 Game' },
  { m: 'dashboard', label: '📊 Dashboard' },
]

export default function App() {
  const [sessionId, setSessionId] = useState('')
  const [topic, setTopicState] = useState('')
  const [mode, setMode] = useState<Mode | null>(null)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  // flashcards / review state
  const cardId = useRef<string | null>(null)
  const reviewQ = useRef<DueItem[]>([])
  const reviewIdx = useRef(0)

  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    createSession().then((s) => {
      setSessionId(s.id)
      setMessages([{ role: 'tutor', text: `${s.greeting}\n\nTell me a topic above, then pick a mode below to begin.` }])
    })
  }, [])

  const push = (m: Msg) => setMessages((prev) => [...prev, m])

  // Stream a tutor/notes turn into a single growing bubble.
  function streamInto(run: (onToken: (t: string) => void, onDone: () => void) => void) {
    setBusy(true)
    let acc = ''
    push({ role: 'tutor', text: '' })
    run(
      (t) => {
        acc += t
        setMessages((prev) => { const c = [...prev]; c[c.length - 1] = { role: 'tutor', text: acc }; return c })
      },
      () => {
        setBusy(false)
        if (acc === '') setMessages((prev) => {
          const c = [...prev]
          c[c.length - 1] = { role: 'tutor', text: '⚠️ Couldn’t reach the tutor — check that the server is running and the API key in server/.env is valid.' }
          return c
        })
      },
    )
  }

  async function pickMode(m: Mode | 'game' | 'dashboard') {
    if (busy || !sessionId) return
    if (m === 'game') { if (!topic.trim()) return nudgeTopic(); return setOverlay('game') }
    if (m === 'dashboard') return setOverlay('dashboard')
    if (!topic.trim()) return nudgeTopic()

    await setTopic(sessionId, topic, m)
    setMode(m)
    push({ role: 'system', text: `— ${label(m)} · ${topic} —` })

    setBusy(true)
    if (m === 'quiz') { await newProblem(sessionId); streamInto((ot, od) => streamTutor(sessionId, ot, () => od())) }
    else if (m === 'notes') { streamInto((ot, od) => streamNotes(sessionId, ot, od)) }
    else if (m === 'flashcards') { await askNextCard(); setBusy(false) }
    else if (m === 'review') { await startReview(); setBusy(false) }
  }

  function nudgeTopic() { push({ role: 'system', text: 'First, type a topic in the bar above.' }) }

  async function askNextCard() {
    const card = await nextCard(sessionId)
    cardId.current = card.id
    push({ role: 'tutor', text: `🃏 Recall the definition of:\n\n${card.term}` })
  }

  async function startReview() {
    const due = await reviewDue(sessionId)
    reviewQ.current = due
    reviewIdx.current = 0
    if (due.length === 0) { push({ role: 'tutor', text: '🔁 Nothing is due for review yet — come back after a while to test what stuck.' }); setMode(null); return }
    askReviewItem()
  }
  function askReviewItem() {
    const it = reviewQ.current[reviewIdx.current]
    push({ role: 'tutor', text: `🔁 Do you still remember: ${it.term}?` })
  }

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    push({ role: 'you', text })
    setBusy(true)

    if (mode === 'quiz') {
      const r = await submitAttempt(sessionId, text)
      if (r.flagged) { setBusy(false); return push({ role: 'tutor', text: r.redirect ?? "Let's keep working on it." }) }
      streamInto((ot, od) => streamTutor(sessionId, ot, () => od()))
    } else if (mode === 'notes') {
      const r = await notesSay(sessionId, text)
      if (r.flagged) { setBusy(false); return push({ role: 'tutor', text: r.redirect ?? "Let's keep going with the notes." }) }
      streamInto((ot, od) => streamNotes(sessionId, ot, od))
    } else if (mode === 'flashcards') {
      if (!cardId.current) { setBusy(false); return }
      const r = await gradeCard(sessionId, cardId.current, text)
      if (r.flagged) { push({ role: 'tutor', text: r.redirect ?? "Nice try — recall it for real." }); setBusy(false); return }
      push({ role: 'tutor', text: `${r.correct ? '✅ Recalled' : '❌ Not yet'} · box ${r.box}${r.mastered ? ' · mastered 🏆' : ''}\n\n${r.reason ?? ''}\n\nBack: ${r.back}` })
      await askNextCard()
      setBusy(false)
    } else if (mode === 'review') {
      const it = reviewQ.current[reviewIdx.current]
      const r = await reviewAttempt(sessionId, it.topic, it.term, text)
      if (r.flagged) { push({ role: 'tutor', text: r.redirect ?? "Recall it for real, no shortcuts." }); setBusy(false); return }
      const hrs = r.delayMs != null ? Math.round(r.delayMs / 3600000) : 0
      push({ role: 'tutor', text: `${r.held ? '🟢 Held' : '🟡 Lapsed'} · ${hrs}h since last seen\n\nBack: ${r.back}` })
      reviewIdx.current += 1
      if (reviewIdx.current >= reviewQ.current.length) { push({ role: 'system', text: 'Review complete 🎉' }); setMode(null) }
      else askReviewItem()
      setBusy(false)
    } else {
      if (!topic.trim()) { setTopicState(text); push({ role: 'tutor', text: `Great — “${text}” it is. Pick a mode below to start.` }) }
      else push({ role: 'tutor', text: 'Pick a mode below to start.' })
      setBusy(false)
    }
  }

  return (
    <div className="relative flex h-screen flex-col text-slate-100">
      <div className="aurora-bg" />
      <div className="aurora-veil" />

      {/* header */}
      <header className="mx-auto flex w-full max-w-2xl items-center gap-3 px-6 pt-5 pb-3">
        <h1 className="brand text-2xl font-black tracking-tight">Study Tutor</h1>
        <div className="glass-soft flex items-center gap-2 px-3 py-1.5">
          <span className="dim text-xs">Studying</span>
          <input className="w-40 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            placeholder="a topic…" value={topic} onChange={(e) => setTopicState(e.target.value)} />
        </div>
        <button className="btn-ghost ml-auto text-sm" onClick={() => setOverlay('dashboard')}>📊</button>
      </header>

      {/* chat thread */}
      <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-6">
        <div className="flex flex-col gap-3 py-2">
          {messages.map((m, i) => {
            if (m.role === 'you') return <div key={i} className="bubble-you max-w-[85%] self-end rounded-2xl px-4 py-2.5 whitespace-pre-wrap">{m.text}</div>
            if (m.role === 'system') return <div key={i} className="msg-in dim self-center text-xs uppercase tracking-wide">{m.text}</div>
            return (
              <div key={i} className="bubble-tutor md max-w-[85%] self-start rounded-2xl px-4 py-2.5">
                {m.text ? <Markdown>{m.text}</Markdown> : (busy ? <Dots /> : null)}
              </div>
            )
          })}
          {busy && ['you', 'system'].includes(messages[messages.length - 1]?.role ?? '') && (
            <div className="bubble-tutor self-start rounded-2xl px-4 py-2.5"><Dots /></div>
          )}
          <div ref={endRef} />
        </div>
      </main>

      {/* composer */}
      <div className="mx-auto w-full max-w-2xl px-6 pb-5 pt-2">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {CHIPS.map(({ m, label: l }) => {
            const needsTopic = m !== 'dashboard' && m !== 'review'
            const active = m === mode
            return (
              <button key={m} onClick={() => pickMode(m)} disabled={busy || (needsTopic && !topic.trim())}
                className={`pill ${active ? 'pill-unlock' : 'pill-muted'} disabled:opacity-40`}>
                {l}
              </button>
            )
          })}
        </div>
        <div className="flex gap-2">
          <input className="field flex-1" placeholder={placeholder(mode)}
            value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} disabled={busy} />
          <button className="btn" onClick={send} disabled={busy || !input.trim()}>Send</button>
        </div>
      </div>

      {/* overlays */}
      {overlay && (
        <div className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/50 p-6 backdrop-blur-sm" onClick={() => setOverlay(null)}>
          <div className="glass mt-10 w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold capitalize">{overlay}</h2>
              <button className="btn-ghost text-sm" onClick={() => setOverlay(null)}>✕ Close</button>
            </div>
            {overlay === 'game' && <GameView sessionId={sessionId} />}
            {overlay === 'dashboard' && <DashboardView sessionId={sessionId} />}
          </div>
        </div>
      )}
    </div>
  )
}

function Dots() {
  return <span className="dots" aria-label="thinking"><span /><span /><span /></span>
}

function label(m: Mode) { return { quiz: 'Quiz', notes: 'Notes', flashcards: 'Flashcards', review: 'Review' }[m] }
function placeholder(mode: Mode | null) {
  if (mode === 'quiz') return 'Type your attempt…'
  if (mode === 'notes') return "Answer the check question, or say 'ready'…"
  if (mode === 'flashcards' || mode === 'review') return 'Type what you remember…'
  return 'Type a topic, then pick a mode…'
}
