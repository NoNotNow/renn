import { courseKey, parseCourseKey } from './courses'
import { createRng } from '@/avEvolution/core/rng'

/**
 * Difficulty curriculum for the field: starts with an empty track (difficulty 0), steps up when the mean policies cover enough of the
 * field courses they just met (exponential moving average of the mean progress fraction of the route; a finish-rate gate never opened
 * because even a sparse field is rarely finished without a single contact), with `minSteps` generations between steps.
 */
export interface CurriculumState {
  difficulty: number
  /** moving average of the mean route fraction covered on field courses at the current difficulty */
  ema: number
  sinceStep: number
}

export interface CurriculumConfig {
  start: number
  step: number
  /** route fraction (EMA) that unlocks the next step */
  threshold: number
  alpha: number
  minSteps: number
  /** field keys of a batch draw their difficulty from [current - window, current] */
  window: number
}

export const DEFAULT_CURRICULUM: CurriculumConfig = { start: 0, step: 0.05, threshold: 0.7, alpha: 0.3, minSteps: 6, window: 0.25 }

export function initialCurriculum(cfg: CurriculumConfig = DEFAULT_CURRICULUM): CurriculumState {
  return { difficulty: cfg.start, ema: 0, sinceStep: 0 }
}

/** Feed one generation's mean route fraction covered on field courses (0..1); the difficulty rises by `step` when the EMA passes the threshold. */
export function updateCurriculum(s: CurriculumState, progressFraction: number, cfg: CurriculumConfig = DEFAULT_CURRICULUM): CurriculumState {
  const ema = s.sinceStep === 0 && s.ema === 0 ? progressFraction : (1 - cfg.alpha) * s.ema + cfg.alpha * progressFraction
  const sinceStep = s.sinceStep + 1
  if (s.difficulty < 1 && ema >= cfg.threshold && sinceStep >= cfg.minSteps) {
    return { difficulty: Math.min(1, Math.round((s.difficulty + cfg.step) * 100) / 100), ema: 0, sinceStep: 0 }
  }
  return { difficulty: s.difficulty, ema, sinceStep }
}

/**
 * Applies the curriculum to a generation's course keys: every field key gets a difficulty drawn (seeded by generation and index)
 * from the window below the current difficulty; other kinds are untouched.
 */
export function applyCurriculum(keys: string[], s: CurriculumState, generation: number, cfg: CurriculumConfig = DEFAULT_CURRICULUM): string[] {
  const rng = createRng((generation * 2654435761) >>> 0)
  return keys.map((k) => {
    const { kind, seed, variant } = parseCourseKey(k)
    if (kind !== 'field' || s.difficulty >= 1) return k
    const lo = Math.max(0, s.difficulty - cfg.window)
    const d = Math.round((lo + (s.difficulty - lo) * rng.next()) * 100) / 100
    return courseKey(kind, seed, variant, Math.min(1, d))
  })
}
