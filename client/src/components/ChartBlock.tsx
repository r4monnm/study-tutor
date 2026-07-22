import { useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

interface ChartSeries {
  name: string
  data: number[]
}

interface ChartSpec {
  type: 'bar' | 'line'
  labels: string[]
  series: ChartSeries[]
  title?: string
}

const COLORS = ['#a78bfa', '#22d3ee', '#f472b6', '#34d399']

export default function ChartBlock({ spec }: { spec: string }) {
  const parsed = useMemo(() => {
    try {
      const s = JSON.parse(spec) as ChartSpec
      if (
        (s.type !== 'bar' && s.type !== 'line') ||
        !Array.isArray(s.labels) ||
        !Array.isArray(s.series)
      ) {
        throw new Error('invalid chart spec')
      }
      return s
    } catch {
      return null
    }
  }, [spec])

  const data = useMemo(() => {
    if (!parsed) return []
    return parsed.labels.map((label, i) => {
      const row: Record<string, string | number> = { label }
      for (const s of parsed.series) row[s.name] = s.data[i]
      return row
    })
  }, [parsed])

  if (!parsed) {
    return <pre className="viz-fallback">{spec}</pre>
  }

  const axisProps = {
    stroke: 'rgba(255,255,255,0.25)',
    tick: { fill: 'rgba(232,234,246,0.75)', fontSize: 11 },
  }
  const tooltipProps = {
    contentStyle: { background: 'rgba(10,10,20,0.92)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8 },
    labelStyle: { color: '#e8eaf6' },
    itemStyle: { color: '#e8eaf6' },
  }

  return (
    <div className="viz-block">
      {parsed.title && <div className="viz-title">{parsed.title}</div>}
      <ResponsiveContainer width="100%" height={240}>
        {parsed.type === 'bar' ? (
          <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip {...tooltipProps} />
            {parsed.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: '#c7cbe4' }} />}
            {parsed.series.map((s, i) => (
              <Bar key={s.name} dataKey={s.name} fill={COLORS[i % COLORS.length]} isAnimationActive={false} />
            ))}
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip {...tooltipProps} />
            {parsed.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: '#c7cbe4' }} />}
            {parsed.series.map((s, i) => (
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={COLORS[i % COLORS.length]}
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
