/* Shared helpers of the node tools: per-key baseline (default params) and the baseline-relative episode timeout. */
import { episodeScore, type FitnessWeights } from '@/avEvolution/core/fitness'
import type { BaselineEntry } from '@/avEvolution/core/evolution'
import { MAZE_EPISODE_SECONDS } from '@/avEvolution/maze/episodes'
import type { EpisodePool } from './pool'

export interface TimeoutPolicy {
  /** timeout = clamp(factor * baselineExitT, floor, MAZE_EPISODE_SECONDS) */
  factor: number
  floor: number
}
export const DEFAULT_TIMEOUT_POLICY: TimeoutPolicy = { factor: 1.6, floor: 25 }

export function timeoutFor(baseline: Record<string, BaselineEntry> | null | undefined, key: string, policy: TimeoutPolicy = DEFAULT_TIMEOUT_POLICY): number {
  const b = baseline?.[key]
  if (!b) return MAZE_EPISODE_SECONDS
  return Math.min(MAZE_EPISODE_SECONDS, Math.max(policy.floor, policy.factor * b.exitT))
}

/** Default-params ("baseline-off") run of every key under the full timeout, with the run's fitness weights. */
export async function computeBaseline(pool: EpisodePool, keys: string[], weights: FitnessWeights): Promise<Record<string, BaselineEntry>> {
  const ms = await Promise.all(keys.map((k) => pool.episode({}, k)))
  return Object.fromEntries(ms.map((m) => [m.key, { score: episodeScore(m, weights), exitT: m.exitT }]))
}
