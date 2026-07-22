import { useEffect, useRef, useState } from 'react'
import { gameBoard, gameResult, type Tile } from '../api'

export default function GameView({ sessionId }: { sessionId: string }) {
  const [tiles, setTiles] = useState<Tile[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [cleared, setCleared] = useState<Set<string>>(new Set())
  const [elapsed, setElapsed] = useState(0)
  const [streak, setStreak] = useState(0)
  const [best, setBest] = useState<{ personalBest: number; isNewBest: boolean } | null>(null)
  const timer = useRef<number | null>(null)
  const penalty = useRef(0)
  const start = useRef(0)

  async function newRound() {
    const b = await gameBoard(sessionId)
    setTiles(b); setSelected(null); setCleared(new Set()); setStreak(0); setBest(null); penalty.current = 0
    start.current = Date.now()
    if (timer.current) clearInterval(timer.current)
    timer.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - start.current) / 1000) + penalty.current), 200)
  }
  useEffect(() => { newRound(); return () => { if (timer.current) clearInterval(timer.current) } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function tap(i: number) {
    if (cleared.has(tiles[i].cardId)) return
    if (selected === null) { setSelected(i); return }
    if (selected === i) { setSelected(null); return }
    const a = tiles[selected], b = tiles[i]
    if (a.cardId === b.cardId && a.kind !== b.kind) {
      const next = new Set(cleared); next.add(a.cardId); setCleared(next); setStreak((s) => s + 1)
      setSelected(null)
      if (next.size * 2 === tiles.length) finish()
    } else {
      penalty.current += 1; setStreak(0); setSelected(null) // +1s penalty for a wrong match
    }
  }

  async function finish() {
    if (timer.current) clearInterval(timer.current)
    const total = Math.floor((Date.now() - start.current) / 1000) + penalty.current
    setElapsed(total)
    setBest(await gameResult(sessionId, total, penalty.current))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 text-sm">
        <span className="rounded-full bg-slate-200 px-3 py-1">⏱ {elapsed}s</span>
        <span className="rounded-full bg-slate-200 px-3 py-1">streak {streak}</span>
        {best && <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">best {best.personalBest}s{best.isNewBest ? ' (new!)' : ''}</span>}
        <button className="ml-auto rounded-lg bg-indigo-600 px-3 py-1 text-white" onClick={newRound}>New round</button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t, i) => {
          const done = cleared.has(t.cardId)
          return (
            <button key={i} onClick={() => tap(i)} disabled={done}
              className={`min-h-16 rounded-lg border p-2 text-sm ${done ? 'invisible' : selected === i ? 'bg-indigo-600 text-white' : 'bg-white'}`}>
              {t.text}
            </button>
          )
        })}
      </div>
      {best && <div className="text-center text-slate-600">Cleared in {elapsed}s! 🎉</div>}
    </div>
  )
}
