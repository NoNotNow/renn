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
}

export const DEFAULT_FITNESS_WEIGHTS: FitnessWeights = { kDist: 0.5, wContact: 3, wContactTime: 2, flipPenalty: 200 }

/** Lower is better (seconds-equivalent). */
export function episodeScore(m: EpisodeMetrics, w: FitnessWeights = DEFAULT_FITNESS_WEIGHTS): number {
  const base = m.reached ? m.exitT : m.timeoutSec + w.kDist * m.remainingDist
  return base + w.wContact * m.contactEvents + w.wContactTime * m.contactFrames * m.dt + (m.flipped ? w.flipPenalty : 0)
}

/** Compact per-episode record stored on candidates (score pre-computed with the run's weights). */
export interface EpisodeRecord {
  key: string
  score: number
  reached: boolean
  exitT: number
  contactEvents: number
}

export function toEpisodeRecord(m: EpisodeMetrics, w: FitnessWeights = DEFAULT_FITNESS_WEIGHTS): EpisodeRecord {
  return { key: m.key, score: episodeScore(m, w), reached: m.reached, exitT: m.reached ? m.exitT : m.timeoutSec, contactEvents: m.contactEvents }
}

export interface Aggregate {
  /** mean score (fitness, lower better); Infinity when n === 0 */
  fitness: number
  meanExitT: number
  reachRate: number
  meanContactEvents: number
  n: number
}

export function aggregate(eps: EpisodeRecord[]): Aggregate {
  const n = eps.length
  if (n === 0) return { fitness: Infinity, meanExitT: Infinity, reachRate: 0, meanContactEvents: 0, n: 0 }
  let s = 0
  let t = 0
  let r = 0
  let c = 0
  for (const e of eps) {
    s += e.score
    t += e.exitT
    r += e.reached ? 1 : 0
    c += e.contactEvents
  }
  return { fitness: s / n, meanExitT: t / n, reachRate: r / n, meanContactEvents: c / n, n }
}
