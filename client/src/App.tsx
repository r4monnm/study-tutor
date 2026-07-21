import { useEffect, useState } from 'react'
import { createSession, setTopic, newProblem, submitAttempt, streamTutor } from './api'

interface Msg { role: 'tutor' | 'you' | 'system'; text: string }

export default function App() {
  const [sessionId, setSessionId] = useState('')
  const [topic, setTopicInput] = useState('')
  const [started, setStarted] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [hintLevel, setHintLevel] = useState(0)
  const [unlocked, setUnlocked] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    createSession().then((s) => {
      setSessionId(s.id)
      setMessages([{ role: 'system', text: s.greeting }])
    })
  }, [])

  function push(m: Msg) { setMessages((prev) => [...prev, m]) }

  // Streams a tutor turn into a single growing message bubble.
  function runTutor() {
    setBusy(true)
    let acc = ''
    push({ role: 'tutor', text: '' })
    streamTutor(
      sessionId,
      (t) => {
        acc += t
        setMessages((prev) => {
          const copy = [...prev]
          copy[copy.length - 1] = { role: 'tutor', text: acc }
          return copy
        })
      },
      (u) => { setUnlocked(u); setBusy(false) },
    )
  }

  async function begin() {
    if (!topic.trim()) return
    await setTopic(sessionId, topic, 'quiz')
    await newProblem(sessionId)
    setStarted(true)
    setUnlocked(false)
    setHintLevel(0)
    runTutor()
  }

  async function send() {
    if (!input.trim() || busy) return
    const attempt = input
    setInput('')
    push({ role: 'you', text: attempt })
    const result = await submitAttempt(sessionId, attempt)
    setHintLevel(result.hintLevel)
    runTutor()
  }

  async function nextProblem() {
    await newProblem(sessionId)
    setUnlocked(false)
    setHintLevel(0)
    push({ role: 'system', text: 'New problem.' })
    runTutor()
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
        <header>
          <h1 className="text-2xl font-bold">Study Tutor</h1>
          <p className="text-sm text-slate-500">Socratic quiz mode — answers stay locked until you show you get it.</p>
        </header>

        {!started ? (
          <div className="flex flex-col gap-3 rounded-xl border bg-white p-4">
            <input
              className="rounded-lg border px-3 py-2"
              placeholder="What do you want to study?"
              value={topic}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && begin()}
            />
            <div className="flex gap-2">
              <button className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white" onClick={begin}>Quiz</button>
              <button className="cursor-not-allowed rounded-lg bg-slate-200 px-4 py-2 text-slate-400" disabled>Notes (soon)</button>
              <button className="cursor-not-allowed rounded-lg bg-slate-200 px-4 py-2 text-slate-400" disabled>Flashcards (soon)</button>
              <button className="cursor-not-allowed rounded-lg bg-slate-200 px-4 py-2 text-slate-400" disabled>Game (soon)</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm">
            <span className={`rounded-full px-3 py-1 font-medium ${unlocked ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {unlocked ? 'Answer unlocked' : 'Answer locked'}
            </span>
            <span className="rounded-full bg-slate-200 px-3 py-1">Hint level {hintLevel}</span>
            {unlocked && <button className="ml-auto rounded-lg bg-indigo-600 px-3 py-1 text-white" onClick={nextProblem}>Next problem</button>}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === 'you'
                  ? 'self-end rounded-2xl bg-indigo-600 px-4 py-2 text-white'
                  : m.role === 'system'
                    ? 'self-center text-sm text-slate-500'
                    : 'self-start rounded-2xl bg-white px-4 py-2 shadow'
              }
            >
              {m.text || (m.role === 'tutor' && busy ? '…' : '')}
            </div>
          ))}
        </div>

        {started && (
          <div className="sticky bottom-4 flex gap-2">
            <input
              className="flex-1 rounded-lg border bg-white px-3 py-2"
              placeholder="Type your attempt…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              disabled={busy}
            />
            <button className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={send} disabled={busy}>Send</button>
          </div>
        )}
      </div>
    </div>
  )
}
