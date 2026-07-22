import type { ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import PlotBlock from './PlotBlock'
import ChartBlock from './ChartBlock'
import MermaidBlock from './MermaidBlock'

const VIZ_LANGS = new Set(['plot', 'chart', 'mermaid'])

function langOf(className: string | undefined): string | undefined {
  return /language-(\w+)/.exec(className || '')?.[1]
}

const components: Components = {
  code(props) {
    const { className, children } = props as { className?: string; children?: ReactNode }
    const lang = langOf(className)
    const text = String(children ?? '')
    if (lang === 'plot') return <PlotBlock spec={text} />
    if (lang === 'chart') return <ChartBlock spec={text} />
    if (lang === 'mermaid') return <MermaidBlock code={text} />
    return <code className={className}>{children}</code>
  },
  // Fenced code blocks are wrapped in <pre> by the parser; our visual
  // blocks render their own framing, so unwrap the <pre> for them to
  // avoid double-boxing (monospace <pre> styles fighting the chart/diagram).
  pre(props) {
    const { children } = props as { children?: ReactNode }
    if (
      children &&
      typeof children === 'object' &&
      'props' in children &&
      VIZ_LANGS.has(langOf((children as { props?: { className?: string } }).props?.className) ?? '')
    ) {
      return <>{children}</>
    }
    return <pre>{children}</pre>
  },
}

export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
      {children}
    </ReactMarkdown>
  )
}
