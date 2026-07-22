import { useEffect, useRef, useState } from 'react'
import Markdown from './components/Markdown'
import {
  createSession, setTopic, newProblem, submitAttempt, streamTutor,
  notesSay, streamNotes, nextCard, gradeCard, reviewDue, reviewAttempt,
  loadChat, appendChat, clearChat,
  type DueItem,
} from './api'
import GameView from './views/GameView'
import DashboardView from './views/DashboardView'
import { supabase } from './lib/supabase'

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

export default function App({ email = '' }: { email?: string }) {
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
    // A fresh study session every load (topic/gate state is per session), but the
    // visible thread is restored from the account so the conversation carries over.
    Promise.all([createSession(), loadChat()]).then(([s, history]) => {
      setSessionId(s.id)
      if (history.length > 0) { setMessages(history); return }
      const greeting = { role: 'tutor' as const, text: `${s.greeting}\n\nTell me a topic above, then pick a mode below to begin.` }
      setMessages([greeting])
      appendChat(greeting.role, greeting.text)
    })
  }, [])

  const push = (m: Msg) => {
    setMessages((prev) => [...prev, m])
    appendChat(m.role, m.text)
  }

  // Stream a tutor/notes turn into a single growing bubble.
  function streamInto(run: (onToken: (t: string) => void, onDone: () => void) => void) {
    setBusy(true)
    let acc = ''
    // The placeholder bubble is local-only; the turn is persisted once, when complete.
    setMessages((prev) => [...prev, { role: 'tutor', text: '' }])
    run(
      (t) => {
        acc += t
        setMessages((prev) => { const c = [...prev]; c[c.length - 1] = { role: 'tutor', text: acc }; return c })
      },
      () => {
        setBusy(false)
        if (acc === '') {
          const failed = '⚠️ Couldn’t reach the tutor — check that the server is running and the API key in server/.env is valid.'
          setMessages((prev) => { const c = [...prev]; c[c.length - 1] = { role: 'tutor', text: failed }; return c })
          return // a failed turn is not worth persisting
        }
        appendChat('tutor', acc)
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
    <div className="relative flex h-[100dvh] flex-col text-slate-100">
      <div className="aurora-bg" />
      <div className="aurora-veil" />

      {/* header */}
      <header className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-2 px-4 pt-4 pb-3 sm:gap-3 sm:px-6 sm:pt-5">
        <h1 className="brand text-xl font-black tracking-tight sm:text-2xl">Study Tutor</h1>
        <div className="glass-soft flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 sm:flex-none">
          <span className="dim shrink-0 text-xs">Studying</span>
          <input className="w-full min-w-0 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none sm:w-40"
            placeholder="a topic…" value={topic} onChange={(e) => setTopicState(e.target.value)} />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button className="btn-ghost text-sm" title="Dashboard" onClick={() => setOverlay('dashboard')}>📊</button>
          <button className="btn-ghost text-sm" title="Clear this thread" disabled={busy}
            onClick={async () => { await clearChat(); setMessages([]); setMode(null) }}>🗑</button>
          <button className="btn-ghost text-sm" title={email || 'Sign out'} onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      {/* chat thread */}
      <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 sm:px-6">
        <div className="flex flex-col gap-3 py-2">
          {messages.map((m, i) => {
            if (m.role === 'you') return <div key={i} className="bubble-you max-w-[85%] self-end rounded-2xl px-4 py-2.5 whitespace-pre-wrap break-words">{m.text}</div>
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
      <div className="mx-auto w-full max-w-2xl px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
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
        <div className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/50 p-3 backdrop-blur-sm sm:p-6" onClick={() => setOverlay(null)}>
          <div className="glass mt-4 w-full max-w-2xl p-4 sm:mt-10 sm:p-6" onClick={(e) => e.stopPropagation()}>
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
