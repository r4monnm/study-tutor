import express from 'express'
import cors from 'cors'
import type { Store, Mode } from './store/types'
import type { Llm } from './llm/types'
import { config } from './config'
import { generateProblem } from './problem'
import { grade } from './grader'
import { applyVerdict, canReveal } from './gate'
import { buildTutorContext } from './tutor'
import { modeInstructions } from './modes/index'
import { toClientProblem, GREETING } from './dto'

export function createApp(deps: { store: Store; llm: Llm }): express.Express {
  const { store, llm } = deps
  const app = express()
  app.use(cors())
  app.use(express.json())

  app.post('/api/session', (_req, res) => {
    const s = store.createSession()
    res.json({ id: s.id, greeting: GREETING })
  })

  app.post('/api/session/:id/topic', (req, res) => {
    const { topic, mode } = req.body as { topic: string; mode: Mode }
    if (!store.getSession(req.params.id)) return res.status(404).json({ error: 'no session' })
    store.setTopicMode(req.params.id, String(topic ?? ''), (mode ?? 'quiz') as Mode)
    return res.json({ ok: true })
  })

  app.post('/api/session/:id/problem', async (req, res) => {
    const s = store.getSession(req.params.id)
    if (!s) return res.status(404).json({ error: 'no session' })
    const priorQTypes = Object.values(s.problems).map((p) => p.problem.qType)
    const problem = await generateProblem(llm, { topic: s.topic, priorQTypes })
    store.putProblem(s.id, problem)
    return res.json({ problem: toClientProblem(problem) })
  })

  app.post('/api/session/:id/attempt', async (req, res) => {
    const s = store.getSession(req.params.id)
    if (!s) return res.status(404).json({ error: 'no session' })
    const problem = store.getActiveProblem(s.id)
    if (!problem) return res.status(400).json({ error: 'no active problem' })
    const attempt = String(req.body?.attempt ?? '')
    store.addTurn(s.id, { role: 'user', content: attempt })
    const verdict = await grade(llm, {
      question: problem.question,
      correct_approach: problem.correct_approach,
      correct_answer: problem.correct_answer,
      attempt,
    })
    const next = applyVerdict(store.getProblemState(s.id, problem.id), verdict, config.hintCap)
    store.setProblemState(s.id, problem.id, next)
    return res.json({
      understanding_demonstrated: verdict.understanding_demonstrated,
      reason: verdict.reason,
      hintLevel: next.hintLevel,
      unlocked: next.unlocked,
    })
  })

  app.get('/api/session/:id/tutor', async (req, res) => {
    const s = store.getSession(req.params.id)
    if (!s) return res.status(404).end()
    const problem = store.getActiveProblem(s.id)
    if (!problem) return res.status(400).end()
    const state = store.getProblemState(s.id, problem.id)

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const ctx = buildTutorContext({
      topic: s.topic,
      mode: s.mode,
      modeInstructions: modeInstructions(s.mode),
      question: problem.question,
      history: s.history,
      hintLevel: state.hintLevel,
      hintCap: config.hintCap,
      graderHint: state.lastGraderHint,
      reveal: canReveal(state) ? { answer: problem.correct_answer, approach: problem.correct_approach } : null,
    })

    const full = await llm.streamText(
      { model: config.tutorModel, system: ctx.system, messages: ctx.messages, adaptiveThinking: true },
      (t) => res.write(`data: ${JSON.stringify({ token: t })}\n\n`),
    )
    store.addTurn(s.id, { role: 'assistant', content: full })
    res.write(`data: ${JSON.stringify({ done: true, unlocked: canReveal(state) })}\n\n`)
    return res.end()
  })

  return app
}
