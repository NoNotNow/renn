import { courseKey, parseCourseKey } from './courses'
import { createRng } from '@/avEvolution/core/rng'

/**
 * Difficulty curriculum for the field: starts easy (few small boxes), steps up when the mean policy finishes enough of the field
 * courses it just met (exponential moving average of the finish rate), never below `minSteps` generations between steps.
 */
export interface CurriculumState {
  difficulty: number
  /** moving average of the field finish rate of the mean policy at the current difficulty */
  ema: number
  sinceStep: number
}

export interface CurriculumConfig {
  start: number
  step: number
  /** finish rate (EMA) that unlocks the next step */
  threshold: number
  alpha: number
  minSteps: number
  /** lowest difficulty that is still sampled once the curriculum has advanced */
  floor: number
}

export const DEFAULT_CURRICULUM: CurriculumConfig = { start: 0.2, step: 0.1, threshold: 0.5, alpha: 0.3, minSteps: 8, floor: 0.2 }

export function initialCurriculum(cfg: CurriculumConfig = DEFAULT_CURRICULUM): CurriculumState {
  return { difficulty: cfg.start, ema: 0, sinceStep: 0 }
}

/** Feed one generation's field finish rate (0..1); returns the new state (difficulty rises by `step` when the EMA passes the threshold). */
export function updateCurriculum(s: CurriculumState, finishRate: number, cfg: CurriculumConfig = DEFAULT_CURRICULUM): CurriculumState {
  const ema = s.sinceStep === 0 && s.ema === 0 ? finishRate : (1 - cfg.alpha) * s.ema + cfg.alpha * finishRate
  const sinceStep = s.sinceStep + 1
  if (s.difficulty < 1 && ema >= cfg.threshold && sinceStep >= cfg.minSteps) {
    return { difficulty: Math.min(1, Math.round((s.difficulty + cfg.step) * 100) / 100), ema: 0, sinceStep: 0 }
  }
  return { difficulty: s.difficulty, ema, sinceStep }
}

/**
 * Applies the curriculum to a generation's course keys: every field key gets a difficulty drawn (seeded by generation and index)
 * between `floor` and the current difficulty; other kinds are untouched.
 */
export function applyCurriculum(keys: string[], s: CurriculumState, generation: number, cfg: CurriculumConfig = DEFAULT_CURRICULUM): string[] {
  const rng = createRng((generation * 2654435761) >>> 0)
  return keys.map((k) => {
    const { kind, seed, variant } = parseCourseKey(k)
    if (kind !== 'field' || s.difficulty >= 1) return k
    const lo = Math.min(cfg.floor, s.difficulty)
    const d = Math.round((lo + (s.difficulty - lo) * rng.next()) * 10) / 10
    return courseKey(kind, seed, variant, Math.min(1, d))
  })
}
