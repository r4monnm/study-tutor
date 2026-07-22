import express from 'express'
import cors from 'cors'
import type { Store, Mode, Deck, Session } from './store/types'
import type { Llm } from './llm/types'
import { MemoryLearnerStore, type LearnerStore } from './learnerStore'
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
import { requireAuth, type Authenticator } from './auth'
import { MemoryChatStore, CHAT_ROLES, MAX_MESSAGE_CHARS, type ChatStore, type ChatRole } from './chatStore'

export function createApp(deps: {
  store: Store
  llm: Llm
  learnerStore?: LearnerStore
  chatStore?: ChatStore
  auth: Authenticator
}): express.Express {
  const { store, llm, auth } = deps
  const learnerStore = deps.learnerStore ?? new MemoryLearnerStore()
  const chatStore = deps.chatStore ?? new MemoryChatStore()
  const app = express()
  app.use(cors())
  app.use(express.json())
  // Every route below is authenticated: no valid Supabase token, no API.
  app.use('/api', requireAuth(auth))

  /**
   * A session is only visible to the account that created it — a leaked session id is
   * useless to anyone else. Returns undefined for "not found OR not yours" so the two
   * cases are indistinguishable to a caller probing for ids.
   */
  async function ownedSession(req: express.Request): Promise<Session | undefined> {
    const s = await store.getSession(String(req.params.id))
    return s && s.learnerId === req.user!.id ? s : undefined
  }

  async function ensureDeck(s: Session): Promise<Deck> {
    let deck = await store.getDeck(s.id)
    if (!deck || deck.topic !== s.topic) {
      const cards = await generateDeck(llm, s.topic)
      deck = { topic: s.topic, cards }
      await store.putDeck(s.id, deck)
      for (const card of cards) await learnerStore.upsertCard(s.learnerId, s.topic, card.term, card.definition)
    }
    return deck
  }

  app.post('/api/session', async (req, res) => {
    // Ownership comes from the verified token; a learnerId in the body is ignored.
    const s = await store.createSession(req.user!.id)
    res.json({ id: s.id, greeting: GREETING })
  })

  // --- The visible thread, kept per account so it survives sign-out ---

  app.get('/api/chat', async (req, res) => {
    res.json({ messages: await chatStore.list(req.user!.id) })
  })

  app.post('/api/chat', async (req, res) => {
    const role = String(req.body?.role ?? '') as ChatRole
    const text = String(req.body?.text ?? '')
    if (!CHAT_ROLES.includes(role)) return res.status(400).json({ error: 'bad role' })
    if (text.length > MAX_MESSAGE_CHARS) return res.status(400).json({ error: 'message too long' })
    await chatStore.append(req.user!.id, { role, text })
    return res.json({ ok: true })
  })

  app.delete('/api/chat', async (req, res) => {
    await chatStore.clear(req.user!.id)
    res.json({ ok: true })
  })

  app.post('/api/session/:id/topic', async (req, res) => {
    const { topic, mode } = req.body as { topic: string; mode: Mode }
    if (!(await ownedSession(req))) return res.status(404).json({ error: 'no session' })
    await store.setTopicMode(req.params.id, String(topic ?? ''), (mode ?? 'quiz') as Mode)
    return res.json({ ok: true })
  })

  app.post('/api/session/:id/problem', async (req, res) => {
    const s = await ownedSession(req)
    if (!s) return res.status(404).json({ error: 'no session' })
    const priorQTypes = Object.values(s.problems).map((p) => p.problem.qType)
    const problem = await generateProblem(llm, { topic: s.topic, priorQTypes })
    await store.putProblem(s.id, problem)
    return res.json({ problem: toClientProblem(problem) })
  })

  app.post('/api/session/:id/attempt', async (req, res) => {
    const s = await ownedSession(req)
    if (!s) return res.status(404).json({ error: 'no session' })
    const problem = await store.getActiveProblem(s.id)
    if (!problem) return res.status(400).json({ error: 'no active problem' })
    const attempt = String(req.body?.attempt ?? '')
    const guard = await screen(llm, attempt)
    if (guard.flagged) {
      const state = await store.getProblemState(s.id, problem.id)
      return res.json({
        flagged: true,
        category: guard.category,
        redirect: guard.redirect,
        hintLevel: state.hintLevel,
        unlocked: state.unlocked,
      })
    }
    await store.addTurn(s.id, { role: 'user', content: attempt })
    const verdict = await grade(llm, {
      question: problem.question,
      correct_approach: problem.correct_approach,
      correct_answer: problem.correct_answer,
      attempt,
    })
    const next = applyVerdict(await store.getProblemState(s.id, problem.id), verdict, config.hintCap)
    await store.setProblemState(s.id, problem.id, next)
    await awardRecall(learnerStore, s.learnerId, verdict.understanding_demonstrated)
    return res.json({
      understanding_demonstrated: verdict.understanding_demonstrated,
      reason: verdict.reason,
      hintLevel: next.hintLevel,
      unlocked: next.unlocked,
    })
  })

  app.get('/api/session/:id/tutor', async (req, res) => {
    const s = await ownedSession(req)
    if (!s) return res.status(404).end()
    const problem = await store.getActiveProblem(s.id)
    if (!problem) return res.status(400).end()
    const state = await store.getProblemState(s.id, problem.id)

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
    await store.addTurn(s.id, { role: 'assistant', content: full })
    res.write(`data: ${JSON.stringify({ done: true, unlocked: canReveal(state) })}\n\n`)
    return res.end()
  })

  app.post('/api/session/:id/deck', async (req, res) => {
    const s = await ownedSession(req)
    if (!s) return res.status(404).json({ error: 'no session' })
    const deck = await ensureDeck(s)
    return res.json({ count: deck.cards.length })
  })

  app.get('/api/session/:id/flashcard/next', async (req, res) => {
    const s = await ownedSession(req)
    if (!s) return res.status(404).json({ error: 'no session' })
    const deck = await ensureDeck(s)
    const entries = await Promise.all(
      deck.cards.map(async (card) => ({ card, state: await learnerStore.getMastery(s.learnerId, s.topic, card.term) })),
    )
    const ordered = weakestFirst(entries)
    if (ordered.length === 0) return res.status(400).json({ error: 'empty deck' })
    return res.json({ card: toCardFront(ordered[0]) })
  })

  app.post('/api/session/:id/flashcard/:cardId/attempt', async (req, res) => {
    const s = await ownedSession(req)
    if (!s) return res.status(404).json({ error: 'no session' })
    const deck = await store.getDeck(req.params.id)
    const card = deck?.cards.find((c) => c.id === req.params.cardId)
    if (!card) return res.status(404).json({ error: 'no card' })
    const attempt = String(req.body?.attempt ?? '')
    const guard = await screen(llm, attempt)
    if (guard.flagged) {
      const prior = (await learnerStore.getMastery(s.learnerId, s.topic, card.term)) ?? initialMasteryState()
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
    const prior = (await learnerStore.getMastery(s.learnerId, s.topic, card.term)) ?? initialMasteryState()
    const next = applyRecall(prior, verdict.understanding_demonstrated, Date.now())
    await learnerStore.setMastery(s.learnerId, s.topic, card.term, next)
    await awardRecall(learnerStore, s.learnerId, verdict.understanding_demonstrated)
    return res.json({
      back: card.definition,
      correct: verdict.understanding_demonstrated,
      reason: verdict.reason,
      box: next.box,
      mastered: isMastered(next),
    })
  })

  app.get('/api/session/:id/mastery', async (req, res) => {
    const s = await ownedSession(req)
    if (!s) return res.status(404).json({ error: 'no session' })
    return res.json(await learnerStore.topicSummary(s.learnerId, s.topic))
  })

  app.get('/api/session/:id/game/board', async (req, res) => {
    const s = await ownedSession(req)
    if (!s) return res.status(404).json({ error: 'no session' })
    const deck = await ensureDeck(s)
    const entries = await Promise.all(
      deck.cards.map(async (card) => ({ card, state: await learnerStore.getMastery(s.learnerId, s.topic, card.term) })),
    )
    const weakest = weakestFirst(entries).slice(0, 6)
    return res.json({ tiles: buildBoard(weakest) })
  })

  app.post('/api/session/:id/game/result', async (req, res) => {
    const s = await ownedSession(req)
    if (!s) return res.status(404).json({ error: 'no session' })
    const seconds = Number(req.body?.timeSeconds)
    if (!Number.isFinite(seconds) || seconds < 0) return res.status(400).json({ error: 'bad timeSeconds' })
    const wrongMatches = Number(req.body?.wrongMatches)
    const result = updatePersonalBest(await learnerStore.getPersonalBest(s.learnerId, s.topic), seconds)
    await learnerStore.setPersonalBest(s.learnerId, s.topic, result.personalBest)
    // Accuracy-scaled points: a clean board (0 wrong) earns the most; never below 1.
    const points = Number.isFinite(wrongMatches) ? Math.max(1, 12 - Math.max(0, wrongMatches)) : 1
    await learnerStore.awardCorrect(s.learnerId, points)
    return res.json({ ...result, points })
  })

  app.post('/api/session/:id/notes/say', async (req, res) => {
    const s = await ownedSession(req)
    if (!s) return res.status(404).json({ error: 'no session' })
    const text = String(req.body?.text ?? '')
    const guard = await screen(llm, text)
    if (guard.flagged) {
      return res.json({ flagged: true, category: guard.category, redirect: guard.redirect })
    }
    await store.addTurn(req.params.id, { role: 'user', content: text })
    return res.json({ ok: true })
  })

  app.get('/api/session/:id/notes', async (req, res) => {
    const s = await ownedSession(req)
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
    await store.addTurn(req.params.id, { role: 'assistant', content: full })
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
    return res.end()
  })

  app.get('/api/session/:id/review/due', async (req, res) => {
    const s = await ownedSession(req)
    if (!s) return res.status(404).json({ error: 'no session' })
    const due = await learnerStore.dueItems(s.learnerId, Date.now(), config.retentionThresholdMs)
    return res.json({ items: due.map((d) => ({ topic: d.topic, term: d.term })) }) // fronts only
  })

  app.post('/api/session/:id/review/attempt', async (req, res) => {
    const s = await ownedSession(req)
    if (!s) return res.status(404).json({ error: 'no session' })
    const topic = String(req.body?.topic ?? '')
    const term = String(req.body?.term ?? '')
    const attempt = String(req.body?.attempt ?? '')
    const definition = await learnerStore.getCardDefinition(s.learnerId, topic, term)
    if (definition === undefined) return res.status(404).json({ error: 'no item' })
    const guard = await screen(llm, attempt)
    if (guard.flagged) return res.json({ flagged: true, category: guard.category, redirect: guard.redirect })
    const verdict = await grade(llm, { question: term, correct_approach: 'Recall the definition of the term.', correct_answer: definition, attempt })
    const now = Date.now()
    const prior = (await learnerStore.getMastery(s.learnerId, topic, term)) ?? initialMasteryState()
    const delayMs = prior.lastSeenAt > 0 ? now - prior.lastSeenAt : 0
    const next = applyRecall(prior, verdict.understanding_demonstrated, now)
    await learnerStore.setMastery(s.learnerId, topic, term, next)
    await learnerStore.recordRetention(s.learnerId, topic, term, delayMs, verdict.understanding_demonstrated, now)
    await awardRecall(learnerStore, s.learnerId, verdict.understanding_demonstrated)
    return res.json({ back: definition, correct: verdict.understanding_demonstrated, held: verdict.understanding_demonstrated, delayMs, box: next.box, mastered: isMastered(next) })
  })

  app.get('/api/session/:id/dashboard', async (req, res) => {
    const s = await ownedSession(req)
    if (!s) return res.status(404).json({ error: 'no session' })
    const stats = await learnerStore.getStats(s.learnerId)
    const topicNames = await learnerStore.topics(s.learnerId)
    const topics = await Promise.all(
      topicNames.map(async (topic) => ({
        topic,
        ...(await learnerStore.topicSummary(s.learnerId, topic)),
        personalBest: await learnerStore.getPersonalBest(s.learnerId, topic),
      })),
    )
    return res.json({
      points: stats.points,
      currentStreak: stats.currentStreak,
      bestStreak: stats.bestStreak,
      topics,
      retention: await learnerStore.retentionSummary(s.learnerId),
    })
  })

  return app
}
