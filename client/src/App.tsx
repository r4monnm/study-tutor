import { useEffect, useState } from 'react'
import { createSession, setTopic, newProblem, submitAttempt, streamTutor } from './api'
import NotesView from './views/NotesView'
import FlashcardsView from './views/FlashcardsView'
import GameView from './views/GameView'
import DashboardView from './views/DashboardView'
import ReviewView from './views/ReviewView'

type Mode = 'quiz' | 'notes' | 'flashcards' | 'game' | 'review' | 'dashboard'
interface Msg { role: 'tutor' | 'you' | 'system'; text: string }

export default function App() {
  const [sessionId, setSessionId] = useState('')
  const [topic, setTopicInput] = useState('')
  const [mode, setMode] = useState<Mode | null>(null)
  const [greeting, setGreeting] = useState('')

  useEffect(() => { createSession().then((s) => { setSessionId(s.id); setGreeting(s.greeting) }) }, [])

  async function start(m: Mode) {
    if (!sessionId) return
    if (m !== 'review') {
      if (!topic.trim()) return
      await setTopic(sessionId, topic, m)
    }
    setMode(m)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold">Study Tutor</h1>
            <p className="text-sm text-slate-500">Four modes, one rule: you work for the answer.</p>
          </div>
          {sessionId && <button className="rounded-lg border px-3 py-1 text-sm" onClick={() => setMode('dashboard')}>📊 Dashboard</button>}
        </header>

        {!mode ? (
          <div className="flex flex-col gap-3 rounded-xl border bg-white p-4">
            {greeting && <p className="text-sm text-slate-500">{greeting}</p>}
            <input className="rounded-lg border px-3 py-2" placeholder="What do you want to study?"
              value={topic} onChange={(e) => setTopicInput(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {(['quiz', 'notes', 'flashcards', 'game', 'review'] as Mode[]).map((m) => (
                <button key={m} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium capitalize text-white disabled:opacity-40"
                  onClick={() => start(m)} disabled={!topic.trim() && m !== 'review'}>{m}</button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <button className="self-start text-sm text-indigo-600" onClick={() => setMode(null)}>← change topic / mode</button>
            {mode === 'quiz' && <QuizView sessionId={sessionId} />}
            {mode === 'notes' && <NotesView sessionId={sessionId} />}
            {mode === 'flashcards' && <FlashcardsView sessionId={sessionId} />}
            {mode === 'game' && <GameView sessionId={sessionId} />}
            {mode === 'review' && <ReviewView sessionId={sessionId} />}
            {mode === 'dashboard' && <DashboardView sessionId={sessionId} />}
          </>
        )}
      </div>
    </div>
  )
}

// Stage-1 Quiz flow, unchanged in behavior, extracted into a component.
function QuizView({ sessionId }: { sessionId: string }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [hintLevel, setHintLevel] = useState(0)
  const [unlocked, setUnlocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [started, setStarted] = useState(false)

  function push(m: Msg) { setMessages((prev) => [...prev, m]) }
  function runTutor() {
    setBusy(true); let acc = ''; push({ role: 'tutor', text: '' })
    streamTutor(sessionId, (t) => {
      acc += t
      setMessages((prev) => { const c = [...prev]; c[c.length - 1] = { role: 'tutor', text: acc }; return c })
    }, (u) => { setUnlocked(u); setBusy(false) })
  }
  async function begin() { await newProblem(sessionId); setStarted(true); setUnlocked(false); setHintLevel(0); runTutor() }
  async function send() {
    if (!input.trim() || busy) return
    const a = input; setInput(''); push({ role: 'you', text: a })
    const r = await submitAttempt(sessionId, a)
    if (r.flagged) { push({ role: 'tutor', text: r.redirect ?? "Let's keep working on it." }); return }
    setHintLevel(r.hintLevel); runTutor()
  }
  async function next() { await newProblem(sessionId); setUnlocked(false); setHintLevel(0); push({ role: 'system', text: 'New problem.' }); runTutor() }

  useEffect(() => { begin() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 text-sm">
        <span className={`rounded-full px-3 py-1 font-medium ${unlocked ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {unlocked ? 'Answer unlocked' : 'Answer locked'}
        </span>
        <span className="rounded-full bg-slate-200 px-3 py-1">Hint level {hintLevel}</span>
        {unlocked && <button className="ml-auto rounded-lg bg-indigo-600 px-3 py-1 text-white" onClick={next}>Next problem</button>}
      </div>
      <div className="flex flex-col gap-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'you' ? 'self-end rounded-2xl bg-indigo-600 px-4 py-2 text-white'
            : m.role === 'system' ? 'self-center text-sm text-slate-500'
            : 'self-start rounded-2xl bg-white px-4 py-2 shadow whitespace-pre-wrap'}>
            {m.text || (m.role === 'tutor' && busy ? '…' : '')}
          </div>
        ))}
      </div>
      {started && (
        <div className="sticky bottom-4 flex gap-2">
          <input className="flex-1 rounded-lg border bg-white px-3 py-2" placeholder="Type your attempt…"
            value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} disabled={busy} />
          <button className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={send} disabled={busy}>Send</button>
        </div>
      )}
    </div>
  )
}
