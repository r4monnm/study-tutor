import { config } from './config'
import type { LearnerStore } from './learnerStore'

// Recall-only points. A correct recall awards points + advances the streak; a wrong one
// resets the streak. Callers only reach this on a genuine (non-flagged) graded attempt.
export function awardRecall(learnerStore: LearnerStore, learnerId: string, correct: boolean): void {
  if (correct) learnerStore.awardCorrect(learnerId, config.pointsPerCorrect)
  else learnerStore.resetStreak(learnerId)
}
