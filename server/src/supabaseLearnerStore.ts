import type { SupabaseClient } from '@supabase/supabase-js'
import { admin, unwrap } from './supabase'
import type { LearnerStore } from './learnerStore'
import type { MasteryState } from './store/types'

/**
 * Postgres-backed durable learner progress — the cross-session half of the app
 * (cards, Leitner mastery, personal bests, points/streaks, retention checks).
 * `learnerId` is the Supabase auth user id, so progress follows the account.
 */
export class SupabaseLearnerStore implements LearnerStore {
  constructor(private sb: SupabaseClient = admin()) {}

  async upsertCard(learnerId: string, topic: string, term: string, definition: string): Promise<void> {
    unwrap(
      await this.sb
        .from('cards')
        .upsert({ user_id: learnerId, topic, term, definition }, { onConflict: 'user_id,topic,term' }),
    )
  }

  async getCardDefinition(learnerId: string, topic: string, term: string): Promise<string | undefined> {
    const { data, error } = await this.sb
      .from('cards').select('definition')
      .eq('user_id', learnerId).eq('topic', topic).eq('term', term)
      .maybeSingle()
    if (error || !data) return undefined
    return data.definition as string
  }

  async getMastery(learnerId: string, topic: string, term: string): Promise<MasteryState | undefined> {
    const { data, error } = await this.sb
      .from('mastery').select('box,attempts,correct,history,last_seen_at')
      .eq('user_id', learnerId).eq('topic', topic).eq('term', term)
      .maybeSingle()
    if (error || !data) return undefined
    return {
      box: data.box as number,
      attempts: data.attempts as number,
      correct: data.correct as number,
      history: (data.history ?? []) as boolean[],
      lastSeenAt: Number(data.last_seen_at),
    }
  }

  async setMastery(learnerId: string, topic: string, term: string, s: MasteryState): Promise<void> {
    unwrap(
      await this.sb.from('mastery').upsert(
        {
          user_id: learnerId, topic, term,
          box: s.box, attempts: s.attempts, correct: s.correct,
          history: s.history, last_seen_at: s.lastSeenAt,
        },
        { onConflict: 'user_id,topic,term' },
      ),
    )
  }

  async topicSummary(learnerId: string, topic: string): Promise<{ mastered: number; total: number; seen: number }> {
    const countOf = async (build: () => PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
      const { count, error } = await build()
      if (error) throw new Error(`supabase: ${error.message}`)
      return count ?? 0
    }
    const [total, mastered, seen] = await Promise.all([
      countOf(() => this.sb.from('cards').select('*', { count: 'exact', head: true }).eq('user_id', learnerId).eq('topic', topic)),
      countOf(() => this.sb.from('mastery').select('*', { count: 'exact', head: true }).eq('user_id', learnerId).eq('topic', topic).gte('box', 4)),
      countOf(() => this.sb.from('mastery').select('*', { count: 'exact', head: true }).eq('user_id', learnerId).eq('topic', topic).gt('attempts', 0)),
    ])
    return { mastered, total, seen }
  }

  async getPersonalBest(learnerId: string, topic: string): Promise<number | undefined> {
    const { data, error } = await this.sb
      .from('personal_best').select('seconds').eq('user_id', learnerId).eq('topic', topic).maybeSingle()
    if (error || !data) return undefined
    return data.seconds as number
  }

  async setPersonalBest(learnerId: string, topic: string, seconds: number): Promise<void> {
    unwrap(
      await this.sb.from('personal_best').upsert({ user_id: learnerId, topic, seconds }, { onConflict: 'user_id,topic' }),
    )
  }

  async getStats(learnerId: string): Promise<{ points: number; currentStreak: number; bestStreak: number }> {
    const { data, error } = await this.sb
      .from('learner_stats').select('points,current_streak,best_streak').eq('user_id', learnerId).maybeSingle()
    if (error || !data) return { points: 0, currentStreak: 0, bestStreak: 0 }
    return {
      points: data.points as number,
      currentStreak: data.current_streak as number,
      bestStreak: data.best_streak as number,
    }
  }

  async awardCorrect(learnerId: string, points: number): Promise<void> {
    const s = await this.getStats(learnerId)
    const cur = s.currentStreak + 1
    unwrap(
      await this.sb.from('learner_stats').upsert(
        { user_id: learnerId, points: s.points + points, current_streak: cur, best_streak: Math.max(s.bestStreak, cur) },
        { onConflict: 'user_id' },
      ),
    )
  }

  async resetStreak(learnerId: string): Promise<void> {
    const s = await this.getStats(learnerId)
    unwrap(
      await this.sb.from('learner_stats').upsert(
        { user_id: learnerId, points: s.points, current_streak: 0, best_streak: s.bestStreak },
        { onConflict: 'user_id' },
      ),
    )
  }

  async dueItems(learnerId: string, now: number, thresholdMs: number): Promise<{ topic: string; term: string; lastSeenAt: number }[]> {
    const rows = unwrap(
      await this.sb
        .from('mastery').select('topic,term,last_seen_at')
        .eq('user_id', learnerId).gt('attempts', 0).gt('last_seen_at', 0)
        .lte('last_seen_at', now - thresholdMs)
        .order('last_seen_at', { ascending: true }),
    ) as { topic: string; term: string; last_seen_at: number }[]
    return rows.map((r) => ({ topic: r.topic, term: r.term, lastSeenAt: Number(r.last_seen_at) }))
  }

  async recordRetention(learnerId: string, topic: string, term: string, delayMs: number, held: boolean, at: number): Promise<void> {
    unwrap(await this.sb.from('retention_event').insert({ user_id: learnerId, topic, term, delay_ms: delayMs, held, at }))
  }

  async retentionSummary(learnerId: string): Promise<{ checks: number; heldRate: number; avgDelayMs: number }> {
    const rows = unwrap(
      await this.sb.from('retention_event').select('delay_ms,held').eq('user_id', learnerId),
    ) as { delay_ms: number; held: boolean }[]
    if (rows.length === 0) return { checks: 0, heldRate: 0, avgDelayMs: 0 }
    const held = rows.filter((r) => r.held).length
    const total = rows.reduce((sum, r) => sum + Number(r.delay_ms), 0)
    return { checks: rows.length, heldRate: held / rows.length, avgDelayMs: Math.round(total / rows.length) }
  }

  async topics(learnerId: string): Promise<string[]> {
    const rows = unwrap(await this.sb.from('cards').select('topic').eq('user_id', learnerId)) as { topic: string }[]
    return [...new Set(rows.map((r) => r.topic))]
  }
}
