import type { MasteryState } from './store/types'

export interface LearnerStore {
  upsertCard(learnerId: string, topic: string, term: string, definition: string): Promise<void>
  getCardDefinition(learnerId: string, topic: string, term: string): Promise<string | undefined>
  getMastery(learnerId: string, topic: string, term: string): Promise<MasteryState | undefined>
  setMastery(learnerId: string, topic: string, term: string, state: MasteryState): Promise<void>
  topicSummary(learnerId: string, topic: string): Promise<{ mastered: number; total: number; seen: number }>
  getPersonalBest(learnerId: string, topic: string): Promise<number | undefined>
  setPersonalBest(learnerId: string, topic: string, seconds: number): Promise<void>
  getStats(learnerId: string): Promise<{ points: number; currentStreak: number; bestStreak: number }>
  awardCorrect(learnerId: string, points: number): Promise<void>
  resetStreak(learnerId: string): Promise<void>
  dueItems(learnerId: string, now: number, thresholdMs: number): Promise<{ topic: string; term: string; lastSeenAt: number }[]>
  recordRetention(learnerId: string, topic: string, term: string, delayMs: number, held: boolean, at: number): Promise<void>
  retentionSummary(learnerId: string): Promise<{ checks: number; heldRate: number; avgDelayMs: number }>
  topics(learnerId: string): Promise<string[]>
}

interface Retention { topic: string; term: string; delayMs: number; held: boolean; at: number }

const key = (...parts: string[]) => JSON.stringify(parts)

/**
 * Non-durable LearnerStore, used as the default in tests and as the safe fallback when
 * no backing store is injected. Deliberately free of native dependencies (`node:sqlite`
 * is not available on every serverless runtime) — production wires up Supabase instead.
 */
export class MemoryLearnerStore implements LearnerStore {
  private cards = new Map<string, string>()
  private masteryByKey = new Map<string, MasteryState>()
  private bests = new Map<string, number>()
  private stats = new Map<string, { points: number; currentStreak: number; bestStreak: number }>()
  private retention = new Map<string, Retention[]>()

  async upsertCard(learnerId: string, topic: string, term: string, definition: string): Promise<void> {
    this.cards.set(key(learnerId, topic, term), definition)
  }

  async getCardDefinition(learnerId: string, topic: string, term: string): Promise<string | undefined> {
    return this.cards.get(key(learnerId, topic, term))
  }

  async getMastery(learnerId: string, topic: string, term: string): Promise<MasteryState | undefined> {
    const s = this.masteryByKey.get(key(learnerId, topic, term))
    return s ? { ...s, history: [...s.history] } : undefined
  }

  async setMastery(learnerId: string, topic: string, term: string, state: MasteryState): Promise<void> {
    this.masteryByKey.set(key(learnerId, topic, term), { ...state, history: [...state.history] })
  }

  async topicSummary(learnerId: string, topic: string): Promise<{ mastered: number; total: number; seen: number }> {
    let total = 0
    for (const k of this.cards.keys()) {
      const [l, t] = JSON.parse(k) as string[]
      if (l === learnerId && t === topic) total++
    }
    let mastered = 0
    let seen = 0
    for (const [k, s] of this.masteryByKey) {
      const [l, t] = JSON.parse(k) as string[]
      if (l !== learnerId || t !== topic) continue
      if (s.box >= 4) mastered++
      if (s.attempts > 0) seen++
    }
    return { mastered, total, seen }
  }

  async getPersonalBest(learnerId: string, topic: string): Promise<number | undefined> {
    return this.bests.get(key(learnerId, topic))
  }

  async setPersonalBest(learnerId: string, topic: string, seconds: number): Promise<void> {
    this.bests.set(key(learnerId, topic), seconds)
  }

  async getStats(learnerId: string): Promise<{ points: number; currentStreak: number; bestStreak: number }> {
    return { ...(this.stats.get(learnerId) ?? { points: 0, currentStreak: 0, bestStreak: 0 }) }
  }

  async awardCorrect(learnerId: string, points: number): Promise<void> {
    const s = await this.getStats(learnerId)
    const cur = s.currentStreak + 1
    this.stats.set(learnerId, { points: s.points + points, currentStreak: cur, bestStreak: Math.max(s.bestStreak, cur) })
  }

  async resetStreak(learnerId: string): Promise<void> {
    const s = await this.getStats(learnerId)
    this.stats.set(learnerId, { ...s, currentStreak: 0 })
  }

  async dueItems(learnerId: string, now: number, thresholdMs: number): Promise<{ topic: string; term: string; lastSeenAt: number }[]> {
    const out: { topic: string; term: string; lastSeenAt: number }[] = []
    for (const [k, s] of this.masteryByKey) {
      const [l, topic, term] = JSON.parse(k) as string[]
      if (l !== learnerId || s.attempts <= 0 || s.lastSeenAt <= 0) continue
      if (now - s.lastSeenAt < thresholdMs) continue
      out.push({ topic, term, lastSeenAt: s.lastSeenAt })
    }
    return out.sort((a, b) => a.lastSeenAt - b.lastSeenAt)
  }

  async recordRetention(learnerId: string, topic: string, term: string, delayMs: number, held: boolean, at: number): Promise<void> {
    const list = this.retention.get(learnerId) ?? []
    list.push({ topic, term, delayMs, held, at })
    this.retention.set(learnerId, list)
  }

  async retentionSummary(learnerId: string): Promise<{ checks: number; heldRate: number; avgDelayMs: number }> {
    const list = this.retention.get(learnerId) ?? []
    if (list.length === 0) return { checks: 0, heldRate: 0, avgDelayMs: 0 }
    const held = list.filter((r) => r.held).length
    const total = list.reduce((sum, r) => sum + r.delayMs, 0)
    return { checks: list.length, heldRate: held / list.length, avgDelayMs: Math.round(total / list.length) }
  }

  async topics(learnerId: string): Promise<string[]> {
    const out = new Set<string>()
    for (const k of this.cards.keys()) {
      const [l, topic] = JSON.parse(k) as string[]
      if (l === learnerId) out.add(topic)
    }
    return [...out]
  }
}
