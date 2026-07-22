import { useEffect, useState } from 'react'
import { getDashboard, type Dashboard } from '../api'

export default function DashboardView({ sessionId }: { sessionId: string }) {
  const [d, setD] = useState<Dashboard | null>(null)
  useEffect(() => { getDashboard(sessionId).then(setD) }, [sessionId])
  if (!d) return <div className="text-slate-500">Loading…</div>
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <Stat label="Points" value={d.points} />
        <Stat label="Streak" value={d.currentStreak} />
        <Stat label="Best streak" value={d.bestStreak} />
      </div>
      <div className="rounded-xl border bg-white p-4">
        <div className="mb-2 text-sm font-medium text-slate-500">Topics</div>
        {d.topics.length === 0 ? <div className="text-slate-400">Nothing studied yet.</div> : d.topics.map((t) => (
          <div key={t.topic} className="flex items-center gap-3 py-1">
            <span className="w-32 truncate font-medium capitalize">{t.topic}</span>
            <div className="h-2 flex-1 rounded bg-slate-100">
              <div className="h-2 rounded bg-green-500" style={{ width: `${t.total ? (t.mastered / t.total) * 100 : 0}%` }} />
            </div>
            <span className="w-24 text-right text-sm text-slate-500">{t.mastered}/{t.total} mastered</span>
            {t.personalBest != null && <span className="w-24 text-right text-sm text-slate-500">best {t.personalBest}s</span>}
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">
        Retention: {d.retention.checks} check{d.retention.checks === 1 ? '' : 's'}
        {d.retention.checks > 0 && <> · {Math.round(d.retention.heldRate * 100)}% held · avg delay {Math.round(d.retention.avgDelayMs / 3600000)}h</>}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 rounded-xl border bg-white p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  )
}
