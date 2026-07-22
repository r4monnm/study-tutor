import { useMemo } from 'react'
import { evaluate } from 'mathjs'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

interface PlotSpec {
  functions: string[]
  domain: [number, number]
  title?: string
}

const COLORS = ['#a78bfa', '#22d3ee', '#f472b6', '#34d399']
const POINTS = 120

export default function PlotBlock({ spec }: { spec: string }) {
  const parsed = useMemo(() => {
    try {
      const s = JSON.parse(spec) as PlotSpec
      if (!Array.isArray(s.functions) || !Array.isArray(s.domain) || s.domain.length !== 2) {
        throw new Error('invalid plot spec')
      }
      return s
    } catch {
      return null
    }
  }, [spec])

  const data = useMemo(() => {
    if (!parsed) return []
    const [lo, hi] = parsed.domain
    const step = (hi - lo) / (POINTS - 1)
    const rows: Record<string, number>[] = []
    for (let i = 0; i < POINTS; i++) {
      const x = lo + step * i
      const row: Record<string, number> = { x }
      for (const fn of parsed.functions) {
        try {
          const y = evaluate(fn, { x })
          if (typeof y === 'number' && Number.isFinite(y)) row[fn] = y
        } catch {
          // skip point for this function
        }
      }
      rows.push(row)
    }
    return rows
  }, [parsed])

  if (!parsed) {
    return <pre className="viz-fallback">{spec}</pre>
  }

  return (
    <div className="viz-block">
      {parsed.title && <div className="viz-title">{parsed.title}</div>}
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" />
          <XAxis
            dataKey="x"
            type="number"
            domain={parsed.domain}
            stroke="rgba(255,255,255,0.25)"
            tick={{ fill: 'rgba(232,234,246,0.75)', fontSize: 11 }}
          />
          <YAxis
            stroke="rgba(255,255,255,0.25)"
            tick={{ fill: 'rgba(232,234,246,0.75)', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{ background: 'rgba(10,10,20,0.92)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8 }}
            labelStyle={{ color: '#e8eaf6' }}
            itemStyle={{ color: '#e8eaf6' }}
          />
          {parsed.functions.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: '#c7cbe4' }} />}
          {parsed.functions.map((fn, i) => (
            <Line
              key={fn}
              type="monotone"
              dataKey={fn}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
