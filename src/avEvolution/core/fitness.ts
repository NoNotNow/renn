export interface EpisodeMetrics {
  key: string
  reached: boolean
  exitT: number
  timeoutSec: number
  remainingDist: number
  contactEvents: number
  contactFrames: number
  dt: number
  minStaticGap: number
  flipped: boolean
  stalledSec: number
  /** forward-speed sign flips with the +-1 m/s hysteresis, counted until the goal is reached (see eval/reversals.ts) */
  reversals: number
  /** seconds with forward speed below -1 m/s (until the goal is reached) */
  reverseS: number
  wallMs: number
}

export interface FitnessWeights {
  /** seconds charged per metre remaining when not reached */
  kDist: number
  /** seconds per contact event */
  wContact: number
  /** multiplier on contact seconds (contactFrames*dt) */
  wContactTime: number
  flipPenalty: number
  /**
   * seconds charged per direction reversal (K-turns, shuttling). 0 disables the term (fitness bit-identical to runs
   * without it). Runs saved before this weight existed resume with 0.
   */
  wReversal: number
  /**
   * seconds charged per second spent reversing (forward speed below -1 m/s, `reverseS`). 0 disables the term (bit-identical
   * fitness). Runs saved before this weight existed resume with 0.
   */
  wReverseS: number
  /**
   * Weight lambda of the worst episode in the aggregate: fitness = (1 - lambda) * mean + lambda * max (over per-episode
   * values; ratios to the baseline when available). Penalises candidates that fail or crawl on a single start.
   */
  wWorst: number
}

/**
 * v2 (design D1): contacts are expensive (10 s per event, 5 s per contact second), the worst episode counts 20 %.
 * wReversal 0.5: one reversal costs half a second of exit time (the baseline makes ~12-20 per maze episode, i.e. ~10-20 % of its score).
 */
export const DEFAULT_FITNESS_WEIGHTS: FitnessWeights = { kDist: 0.5, wContact: 10, wContactTime: 5, flipPenalty: 200, wWorst: 0.2, wReversal: 0.5, wReverseS: 0 }

/** Lower is better (seconds-equivalent). */
export function episodeScore(m: EpisodeMetrics, w: FitnessWeights = DEFAULT_FITNESS_WEIGHTS): number {
  const base = m.reached ? m.exitT : m.timeoutSec + w.kDist * m.remainingDist
  const score = base + w.wContact * m.contactEvents + w.wContactTime * m.contactFrames * m.dt + (m.flipped ? w.flipPenalty : 0)
  // guarded so weight 0 (or a missing field on old data) leaves the score bit-identical
  const withRev = w.wReversal ? score + w.wReversal * (m.reversals ?? 0) : score
  return w.wReverseS ? withRev + w.wReverseS * (m.reverseS ?? 0) : withRev
}

/** Compact per-episode record stored on candidates (score pre-computed with the run's weights). */
export interface EpisodeRecord {
  key: string
  score: number
  reached: boolean
  exitT: number
  contactEvents: number
  /** reversals / seconds reversing of the episode (absent in records from before the metric existed) */
  reversals?: number
  reverseS?: number
  /** score / baselineScore(key): per-episode normalisation so hard and easy mazes weigh equally (1 = baseline). */
  ratio?: number
}

/** `baselineScore` = episodeScore of the default-params run on the same key (omit => no normalisation). */
export function toEpisodeRecord(m: EpisodeMetrics, w: FitnessWeights = DEFAULT_FITNESS_WEIGHTS, baselineScore?: number): EpisodeRecord {
  const score = episodeScore(m, w)
  const rec: EpisodeRecord = { key: m.key, score, reached: m.reached, exitT: m.reached ? m.exitT : m.timeoutSec, contactEvents: m.contactEvents, reversals: m.reversals, reverseS: m.reverseS }
  if (baselineScore !== undefined && baselineScore > 0) rec.ratio = score / baselineScore
  return rec
}

export interface Aggregate {
  /** mean score (fitness, lower better); Infinity when n === 0 */
  fitness: number
  meanExitT: number
  reachRate: number
  meanContactEvents: number
  /** mean reversals per episode (episodes without the field count as 0) */
  meanReversals: number
  n: number
}

/** Per-episode value that is averaged: the baseline ratio when present, else the raw score. */
export const episodeValue = (e: EpisodeRecord): number => e.ratio ?? e.score

export function aggregate(eps: EpisodeRecord[], w: Pick<FitnessWeights, 'wWorst'> = { wWorst: 0 }): Aggregate {
  const n = eps.length
  if (n === 0) return { fitness: Infinity, meanExitT: Infinity, reachRate: 0, meanContactEvents: 0, meanReversals: 0, n: 0 }
  let s = 0
  let t = 0
  let r = 0
  let c = 0
  let rv = 0
  let worst = -Infinity
  for (const e of eps) {
    const v = episodeValue(e)
    s += v
    if (v > worst) worst = v
    t += e.exitT
    r += e.reached ? 1 : 0
    c += e.contactEvents
    rv += e.reversals ?? 0
  }
  const lam = w.wWorst ?? 0
  return { fitness: (1 - lam) * (s / n) + lam * worst, meanExitT: t / n, reachRate: r / n, meanContactEvents: c / n, meanReversals: rv / n, n }
}
