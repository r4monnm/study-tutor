import express from 'express'
import cors from 'cors'
import type { Store, Mode, Deck } from './store/types'
import type { Llm } from './llm/types'
import { SqliteLearnerStore, type LearnerStore } from './learnerStore'
import { config } from './config'
import { generateProblem } from './problem'
import { grade } from './grader'
import { applyVerdict, canReveal } from './gate'
import { buildTutorContext } from './tutor'
import { modeInstructions } from './modes/index'
import { generateDeck } from './deck'
import { weakestFirst, applyRecall, initialMasteryState, isMastered } from './mastery'
import { buildNotesContext } from './notes'
import { buildBoard } from './game'
import { updatePersonalBest } from './game'
import { toClientProblem, toCardFront, GREETING } from './dto'
import { screen } from './guardrail'
import { awardRecall } from './points'

export function createApp(deps: { store: Store; llm: Llm; learnerStore?: LearnerStore }): express.Express {
  const { store, llm } = deps
  const learnerStore = deps.learnerStore ?? new SqliteLearnerStore()
  const app = express()
  app.use(cors())
  app.use(express.json())

  async function ensureDeck(sid: string): Promise<Deck | undefined> {
    const s = store.getSession(sid)
    if (!s) return undefined
    let deck = store.getDeck(sid)
    if (!deck || deck.topic !== s.topic) {
      const cards = await generateDeck(llm, s.topic)
      deck = { topic: s.topic, cards }
      store.putDeck(sid, deck)
      for (const card of cards) learnerStore.upsertCard(s.learnerId, s.topic, card.term, card.definition)
    }
    return deck
  }

  app.post('/api/session', (req, res) => {
    const s = store.createSession(String(req.body?.learnerId ?? ''))
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
    const guard = await screen(llm, attempt)
    if (guard.flagged) {
      const state = store.getProblemState(s.id, problem.id)
      return res.json({
        flagged: true,
        category: guard.category,
        redirect: guard.redirect,
        hintLevel: state.hintLevel,
        unlocked: state.unlocked,
      })
    }
    store.addTurn(s.id, { role: 'user', content: attempt })
    const verdict = await grade(llm, {
      question: problem.question,
      correct_approach: problem.correct_approach,
      correct_answer: problem.correct_answer,
      attempt,
    })
    const next = applyVerdict(store.getProblemState(s.id, problem.id), verdict, config.hintCap)
    store.setProblemState(s.id, problem.id, next)
    awardRecall(learnerStore, s.learnerId, verdict.understanding_demonstrated)
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

  app.post('/api/session/:id/deck', async (req, res) => {
    const deck = await ensureDeck(req.params.id)
    if (!deck) return res.status(404).json({ error: 'no session' })
    return res.json({ count: deck.cards.length })
  })

  app.get('/api/session/:id/flashcard/next', async (req, res) => {
    const deck = await ensureDeck(req.params.id)
    if (!deck) return res.status(404).json({ error: 'no session' })
    const s = store.getSession(req.params.id)!
    const entries = deck.cards.map((card) => ({ card, state: learnerStore.getMastery(s.learnerId, s.topic, card.term) }))
    const ordered = weakestFirst(entries)
    if (ordered.length === 0) return res.status(400).json({ error: 'empty deck' })
    return res.json({ card: toCardFront(ordered[0]) })
  })

  app.post('/api/session/:id/flashcard/:cardId/attempt', async (req, res) => {
    const s = store.getSession(req.params.id)
    if (!s) return res.status(404).json({ error: 'no session' })
    const deck = store.getDeck(req.params.id)
    const card = deck?.cards.find((c) => c.id === req.params.cardId)
    if (!card) return res.status(404).json({ error: 'no card' })
    const attempt = String(req.body?.attempt ?? '')
    const guard = await screen(llm, attempt)
    if (guard.flagged) {
      const prior = learnerStore.getMastery(s.learnerId, s.topic, card.term) ?? initialMasteryState()
      return res.json({
        flagged: true,
        category: guard.category,
        redirect: guard.redirect,
        box: prior.box,
        mastered: isMastered(prior),
      })
    }
    const verdict = await grade(llm, {
      question: card.term,
      correct_approach: 'Recall the definition of the term.',
      correct_answer: card.definition,
      attempt,
    })
    const prior = learnerStore.getMastery(s.learnerId, s.topic, card.term) ?? initialMasteryState()
    const next = applyRecall(prior, verdict.understanding_demonstrated, Date.now())
    learnerStore.setMastery(s.learnerId, s.topic, card.term, next)
    awardRecall(learnerStore, s.learnerId, verdict.understanding_demonstrated)
    return res.json({
      back: card.definition,
      correct: verdict.understanding_demonstrated,
      reason: verdict.reason,
      box: next.box,
      mastered: isMastered(next),
    })
  })

  app.get('/api/session/:id/mastery', (req, res) => {
    const s = store.getSession(req.params.id)
    if (!s) return res.json({ total: 0, mastered: 0, seen: 0 })
    return res.json(learnerStore.topicSummary(s.learnerId, s.topic))
  })

  app.get('/api/session/:id/game/board', async (req, res) => {
    const deck = await ensureDeck(req.params.id)
    if (!deck) return res.status(404).json({ error: 'no session' })
    const s = store.getSession(req.params.id)!
    const entries = deck.cards.map((card) => ({ card, state: learnerStore.getMastery(s.learnerId, s.topic, card.term) }))
    const weakest = weakestFirst(entries).slice(0, 6)
    return res.json({ tiles: buildBoard(weakest) })
  })

  app.post('/api/session/:id/game/result', (req, res) => {
    const s = store.getSession(req.params.id)
    if (!s) return res.status(404).json({ error: 'no session' })
    const seconds = Number(req.body?.timeSeconds)
    if (!Number.isFinite(seconds) || seconds < 0) return res.status(400).json({ error: 'bad timeSeconds' })
    const wrongMatches = Number(req.body?.wrongMatches)
    const result = updatePersonalBest(learnerStore.getPersonalBest(s.learnerId, s.topic), seconds)
    learnerStore.setPersonalBest(s.learnerId, s.topic, result.personalBest)
    // Accuracy-scaled points: a clean board (0 wrong) earns the most; never below 1.
    const points = Number.isFinite(wrongMatches) ? Math.max(1, 12 - Math.max(0, wrongMatches)) : 1
    learnerStore.awardCorrect(s.learnerId, points)
    return res.json({ ...result, points })
  })

  app.post('/api/session/:id/notes/say', async (req, res) => {
    const s = store.getSession(req.params.id)
    if (!s) return res.status(404).json({ error: 'no session' })
    const text = String(req.body?.text ?? '')
    const guard = await screen(llm, text)
    if (guard.flagged) {
      return res.json({ flagged: true, category: guard.category, redirect: guard.redirect })
    }
    store.addTurn(req.params.id, { role: 'user', content: text })
    return res.json({ ok: true })
  })

  app.get('/api/session/:id/notes', async (req, res) => {
    const s = store.getSession(req.params.id)
    if (!s) return res.status(404).end()
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    const ctx = buildNotesContext({
      topic: s.topic,
      modeInstructions: modeInstructions('notes'),
      history: s.history,
    })
    const full = await llm.streamText(
      { model: config.tutorModel, system: ctx.system, messages: ctx.messages, adaptiveThinking: true },
      (t) => res.write(`data: ${JSON.stringify({ token: t })}\n\n`),
    )
    store.addTurn(req.params.id, { role: 'assistant', content: full })
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
    return res.end()
  })

  app.get('/api/session/:id/review/due', (req, res) => {
    const s = store.getSession(req.params.id)
    if (!s) return res.status(404).json({ error: 'no session' })
    const due = learnerStore.dueItems(s.learnerId, Date.now(), config.retentionThresholdMs)
    return res.json({ items: due.map((d) => ({ topic: d.topic, term: d.term })) }) // fronts only
  })

  app.post('/api/session/:id/review/attempt', async (req, res) => {
    const s = store.getSession(req.params.id)
    if (!s) return res.status(404).json({ error: 'no session' })
    const topic = String(req.body?.topic ?? '')
    const term = String(req.body?.term ?? '')
    const attempt = String(req.body?.attempt ?? '')
    const definition = learnerStore.getCardDefinition(s.learnerId, topic, term)
    if (definition === undefined) return res.status(404).json({ error: 'no item' })
    const guard = await screen(llm, attempt)
    if (guard.flagged) return res.json({ flagged: true, category: guard.category, redirect: guard.redirect })
    const verdict = await grade(llm, { question: term, correct_approach: 'Recall the definition of the term.', correct_answer: definition, attempt })
    const now = Date.now()
    const prior = learnerStore.getMastery(s.learnerId, topic, term) ?? initialMasteryState()
    const delayMs = prior.lastSeenAt > 0 ? now - prior.lastSeenAt : 0
    const next = applyRecall(prior, verdict.understanding_demonstrated, now)
    learnerStore.setMastery(s.learnerId, topic, term, next)
    learnerStore.recordRetention(s.learnerId, topic, term, delayMs, verdict.understanding_demonstrated, now)
    awardRecall(learnerStore, s.learnerId, verdict.understanding_demonstrated)
    return res.json({ back: definition, correct: verdict.understanding_demonstrated, held: verdict.understanding_demonstrated, delayMs, box: next.box, mastered: isMastered(next) })
  })

  return app
}
