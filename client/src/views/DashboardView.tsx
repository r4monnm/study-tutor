import { useEffect, useState } from 'react'
import { getDashboard, type Dashboard } from '../api'

export default function DashboardView({ sessionId }: { sessionId: string }) {
  const [d, setD] = useState<Dashboard | null>(null)
  useEffect(() => { getDashboard(sessionId).then(setD) }, [sessionId])
  if (!d) return <div className="muted">Loading…</div>
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <Stat label="Points" value={d.points} />
        <Stat label="Streak" value={d.currentStreak} />
        <Stat label="Best streak" value={d.bestStreak} />
      </div>
      <div className="glass p-5">
        <div className="muted mb-3 text-sm font-medium">Topics</div>
        {d.topics.length === 0 ? <div className="dim">Nothing studied yet.</div> : d.topics.map((t) => (
          <div key={t.topic} className="flex items-center gap-3 py-1.5">
            <span className="w-32 truncate font-medium capitalize">{t.topic}</span>
            <div className="bar-track flex-1">
              <div className="bar-fill" style={{ width: `${t.total ? (t.mastered / t.total) * 100 : 0}%` }} />
            </div>
            <span className="muted w-24 text-right text-sm">{t.mastered}/{t.total} mastered</span>
            {t.personalBest != null && <span className="dim w-24 text-right text-sm">best {t.personalBest}s</span>}
          </div>
        ))}
      </div>
      <div className="glass muted p-5 text-sm">
        <span className="font-medium text-slate-200">Retention:</span> {d.retention.checks} check{d.retention.checks === 1 ? '' : 's'}
        {d.retention.checks > 0 && <> · {Math.round(d.retention.heldRate * 100)}% held · avg delay {Math.round(d.retention.avgDelayMs / 3600000)}h</>}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass flex-1 p-4 text-center">
      <div className="brand text-3xl font-black">{value}</div>
      <div className="dim text-xs uppercase tracking-wide">{label}</div>
    </div>
  )
}
