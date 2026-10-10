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

// --- v3 stage curriculum (free track -> obstacles) -----------------------------------------------------------------------------------

/**
 * Stage curriculum of the v3 training: every generation draws `share` of its setups from the obstacle kinds (field / slalom / maze / crowd chains as in v2 plus the
 * bay / corridor reversal setups), the rest from the free track. The share starts at 0 (free track only) and rises by `step` up to `max` whenever the EMA of the
 * free-track chain finish rate reaches `threshold` (at least `minSteps` generations between steps). At least one free-track setup stays in every batch.
 */
export interface StageState {
  share: number
  /** moving average of the chain finish rate on free-track episodes (centre policies) */
  ema: number
  sinceStep: number
}
export interface StageConfig {
  start: number
  step: number
  max: number
  threshold: number
  alpha: number
  minSteps: number
}
export const DEFAULT_STAGE: StageConfig = { start: 0, step: 0.1, max: 0.7, threshold: 0.7, alpha: 0.3, minSteps: 6 }

export const initialStage = (cfg: StageConfig = DEFAULT_STAGE): StageState => ({ share: cfg.start, ema: 0, sinceStep: 0 })

/** Feed one generation's free-track chain finish rate (0..1). Rises only through the gate. */
export function updateStage(s: StageState, freeFinishRate: number, cfg: StageConfig = DEFAULT_STAGE): StageState {
  const ema = s.sinceStep === 0 && s.ema === 0 ? freeFinishRate : (1 - cfg.alpha) * s.ema + cfg.alpha * freeFinishRate
  const sinceStep = s.sinceStep + 1
  if (s.share < cfg.max - 1e-9 && ema >= cfg.threshold && sinceStep >= cfg.minSteps) return { share: Math.min(cfg.max, Math.round((s.share + cfg.step) * 100) / 100), ema: 0, sinceStep: 0 }
  return { share: s.share, ema, sinceStep }
}

/** order in which obstacle kinds join the batches (the reversal setups first: they are what the free track prepares for) */
export const OBSTACLE_KIND_ORDER = ['bay', 'corridor', 'slalom', 'crowd', 'field', 'maze'] as const

/** Kinds active at this stage: `free` always, plus the first round(share / max x 6) obstacle kinds (share 0 = free only, share max = all). */
export function activeKinds(share: number, cfg: StageConfig = DEFAULT_STAGE): string[] {
  const n = Math.min(OBSTACLE_KIND_ORDER.length, Math.round((share / cfg.max) * OBSTACLE_KIND_ORDER.length))
  return ['free', ...OBSTACLE_KIND_ORDER.slice(0, n)]
}

/**
 * STRATIFIED batch: every active kind contributes exactly `perKind` items (a rotating window over its own list), so every candidate sees all active kinds
 * and the min over kinds in the fitness is meaningful.
 */
export function stageBatch<T>(byKind: Record<string, T[]>, active: string[], perKind: number, generation: number): T[] {
  const out: T[] = []
  for (const k of active) {
    const list = byKind[k] ?? []
    for (let j = 0; j < perKind && list.length; j++) out.push(list[(generation * perKind + j) % list.length]!)
  }
  return out
}
