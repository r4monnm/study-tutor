import { useEffect, useState } from 'react'
import { notesSay, streamNotes } from '../api'

export default function NotesView({ sessionId }: { sessionId: string }) {
  const [chunks, setChunks] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  function stream() {
    setBusy(true)
    let acc = ''
    setChunks((c) => [...c, ''])
    streamNotes(
      sessionId,
      (t) => { acc += t; setChunks((c) => { const copy = [...c]; copy[copy.length - 1] = acc; return copy }) },
      () => setBusy(false),
    )
  }

  useEffect(() => { stream() /* first chunk */ }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    if (!input.trim() || busy) return
    const text = input; setInput('')
    setChunks((c) => [...c, `You: ${text}`])
    const r = await notesSay(sessionId, text)
    if (r.flagged) { setChunks((c) => [...c, r.redirect ?? "Let's keep going with the notes."]); return }
    stream()
  }

  return (
    <div className="flex flex-col gap-3">
      {chunks.map((c, i) => (
        <div key={i} className={c.startsWith('You: ') ? 'self-end rounded-2xl bg-indigo-600 px-4 py-2 text-white' : 'self-start rounded-2xl bg-white px-4 py-2 shadow whitespace-pre-wrap'}>
          {c || (busy ? '…' : '')}
        </div>
      ))}
      <div className="sticky bottom-4 flex gap-2">
        <input className="flex-1 rounded-lg border bg-white px-3 py-2" placeholder="Answer the check question, or say 'ready'…"
          value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} disabled={busy} />
        <button className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={send} disabled={busy}>Send</button>
      </div>
    </div>
  )
}
