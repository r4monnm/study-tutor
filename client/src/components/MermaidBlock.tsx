import { useEffect, useId, useState } from 'react'
import mermaid from 'mermaid'

let initialized = false
function ensureInit() {
  if (initialized) return
  mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' })
  initialized = true
}

export default function MermaidBlock({ code }: { code: string }) {
  const rawId = useId()
  const id = `mermaid-${rawId.replace(/:/g, '')}`
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    ensureInit()
    setError(false)
    setSvg(null)
    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, id])

  if (error) {
    return <pre className="viz-fallback">{code}</pre>
  }

  if (!svg) {
    return <div className="viz-block dim text-sm">Rendering diagram…</div>
  }

  return <div className="viz-block" dangerouslySetInnerHTML={{ __html: svg }} />
}
