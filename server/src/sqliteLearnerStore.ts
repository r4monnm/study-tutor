// Local-only implementation. Kept in its own module so that importing the LearnerStore
// interface never pulls in `node:sqlite`, which is unavailable on some serverless
// runtimes and would crash the function at import time.
import { DatabaseSync } from 'node:sqlite'
import type { LearnerStore } from './learnerStore'
import type { MasteryState } from './store/types'

const DDL = `
CREATE TABLE IF NOT EXISTS card (learner_id TEXT, topic TEXT, term TEXT, definition TEXT, PRIMARY KEY (learner_id, topic, term));
CREATE TABLE IF NOT EXISTS mastery (learner_id TEXT, topic TEXT, term TEXT, box INTEGER, attempts INTEGER, correct INTEGER, history_json TEXT, last_seen_at INTEGER, PRIMARY KEY (learner_id, topic, term));
CREATE TABLE IF NOT EXISTS personal_best (learner_id TEXT, topic TEXT, seconds INTEGER, PRIMARY KEY (learner_id, topic));
CREATE TABLE IF NOT EXISTS learner_stats (learner_id TEXT PRIMARY KEY, points INTEGER, current_streak INTEGER, best_streak INTEGER);
CREATE TABLE IF NOT EXISTS retention_event (learner_id TEXT, topic TEXT, term TEXT, delay_ms INTEGER, held INTEGER, at INTEGER);
`

export class SqliteLearnerStore implements LearnerStore {
  private db: DatabaseSync

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path)
    this.db.exec(DDL)
  }

  async upsertCard(learnerId: string, topic: string, term: string, definition: string): Promise<void> {
    this.db
      .prepare(`INSERT INTO card(learner_id,topic,term,definition) VALUES(?,?,?,?)
        ON CONFLICT(learner_id,topic,term) DO UPDATE SET definition=excluded.definition`)
      .run(learnerId, topic, term, definition)
  }

  async getCardDefinition(learnerId: string, topic: string, term: string): Promise<string | undefined> {
    const r = this.db.prepare(`SELECT definition FROM card WHERE learner_id=? AND topic=? AND term=?`).get(learnerId, topic, term) as { definition: string } | undefined
    return r?.definition
  }

  async getMastery(learnerId: string, topic: string, term: string): Promise<MasteryState | undefined> {
    const r = this.db.prepare(`SELECT box,attempts,correct,history_json,last_seen_at FROM mastery WHERE learner_id=? AND topic=? AND term=?`).get(learnerId, topic, term) as
      | { box: number; attempts: number; correct: number; history_json: string; last_seen_at: number }
      | undefined
    if (!r) return undefined
    return { box: r.box, attempts: r.attempts, correct: r.correct, history: JSON.parse(r.history_json), lastSeenAt: r.last_seen_at }
  }

  async setMastery(learnerId: string, topic: string, term: string, s: MasteryState): Promise<void> {
    this.db
      .prepare(`INSERT INTO mastery(learner_id,topic,term,box,attempts,correct,history_json,last_seen_at) VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(learner_id,topic,term) DO UPDATE SET box=excluded.box,attempts=excluded.attempts,correct=excluded.correct,history_json=excluded.history_json,last_seen_at=excluded.last_seen_at`)
      .run(learnerId, topic, term, s.box, s.attempts, s.correct, JSON.stringify(s.history), s.lastSeenAt)
  }

  async topicSummary(learnerId: string, topic: string): Promise<{ mastered: number; total: number; seen: number }> {
    const total = (this.db.prepare(`SELECT COUNT(*) c FROM card WHERE learner_id=? AND topic=?`).get(learnerId, topic) as { c: number }).c
    const mastered = (this.db.prepare(`SELECT COUNT(*) c FROM mastery WHERE learner_id=? AND topic=? AND box>=4`).get(learnerId, topic) as { c: number }).c
    const seen = (this.db.prepare(`SELECT COUNT(*) c FROM mastery WHERE learner_id=? AND topic=? AND attempts>0`).get(learnerId, topic) as { c: number }).c
    return { mastered, total, seen }
  }

  async getPersonalBest(learnerId: string, topic: string): Promise<number | undefined> {
    const r = this.db.prepare(`SELECT seconds FROM personal_best WHERE learner_id=? AND topic=?`).get(learnerId, topic) as { seconds: number } | undefined
    return r?.seconds
  }

  async setPersonalBest(learnerId: string, topic: string, seconds: number): Promise<void> {
    this.db
      .prepare(`INSERT INTO personal_best(learner_id,topic,seconds) VALUES(?,?,?)
        ON CONFLICT(learner_id,topic) DO UPDATE SET seconds=excluded.seconds`)
      .run(learnerId, topic, seconds)
  }

  async getStats(learnerId: string): Promise<{ points: number; currentStreak: number; bestStreak: number }> {
    const r = this.db.prepare(`SELECT points,current_streak,best_streak FROM learner_stats WHERE learner_id=?`).get(learnerId) as
      | { points: number; current_streak: number; best_streak: number }
      | undefined
    return r ? { points: r.points, currentStreak: r.current_streak, bestStreak: r.best_streak } : { points: 0, currentStreak: 0, bestStreak: 0 }
  }

  async awardCorrect(learnerId: string, points: number): Promise<void> {
    const s = await this.getStats(learnerId)
    const cur = s.currentStreak + 1
    const best = Math.max(s.bestStreak, cur)
    this.db
      .prepare(`INSERT INTO learner_stats(learner_id,points,current_streak,best_streak) VALUES(?,?,?,?)
        ON CONFLICT(learner_id) DO UPDATE SET points=excluded.points,current_streak=excluded.current_streak,best_streak=excluded.best_streak`)
      .run(learnerId, s.points + points, cur, best)
  }

  async resetStreak(learnerId: string): Promise<void> {
    const s = await this.getStats(learnerId)
    this.db
      .prepare(`INSERT INTO learner_stats(learner_id,points,current_streak,best_streak) VALUES(?,?,?,?)
        ON CONFLICT(learner_id) DO UPDATE SET current_streak=0`)
      .run(learnerId, s.points, 0, s.bestStreak)
  }

  async dueItems(learnerId: string, now: number, thresholdMs: number): Promise<{ topic: string; term: string; lastSeenAt: number }[]> {
    return (
      this.db
        .prepare(`SELECT topic,term,last_seen_at FROM mastery WHERE learner_id=? AND attempts>0 AND last_seen_at>0 AND (?-last_seen_at)>=? ORDER BY last_seen_at ASC`)
        .all(learnerId, now, thresholdMs) as { topic: string; term: string; last_seen_at: number }[]
    ).map((r) => ({ topic: r.topic, term: r.term, lastSeenAt: r.last_seen_at }))
  }

  async recordRetention(learnerId: string, topic: string, term: string, delayMs: number, held: boolean, at: number): Promise<void> {
    this.db.prepare(`INSERT INTO retention_event(learner_id,topic,term,delay_ms,held,at) VALUES(?,?,?,?,?,?)`).run(learnerId, topic, term, delayMs, held ? 1 : 0, at)
  }

  async retentionSummary(learnerId: string): Promise<{ checks: number; heldRate: number; avgDelayMs: number }> {
    const checks = (this.db.prepare(`SELECT COUNT(*) c FROM retention_event WHERE learner_id=?`).get(learnerId) as { c: number }).c
    if (checks === 0) return { checks: 0, heldRate: 0, avgDelayMs: 0 }
    const held = (this.db.prepare(`SELECT COUNT(*) c FROM retention_event WHERE learner_id=? AND held=1`).get(learnerId) as { c: number }).c
    const avg = (this.db.prepare(`SELECT AVG(delay_ms) a FROM retention_event WHERE learner_id=?`).get(learnerId) as { a: number }).a
    return { checks, heldRate: held / checks, avgDelayMs: Math.round(avg) }
  }

  async topics(learnerId: string): Promise<string[]> {
    return (this.db.prepare(`SELECT DISTINCT topic FROM card WHERE learner_id=?`).all(learnerId) as { topic: string }[]).map((r) => r.topic)
  }
}
