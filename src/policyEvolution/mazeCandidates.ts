/**
 * Maze-training candidate models for the Training Mazes dialog: the island centers of the running training, the
 * latest best and the shipped policy, exported by `tools/policy-evolution/export-maze-candidates.ts` into
 * `public/policy-evolution/candidates.json` (refreshed by the auto-trial watcher while the training runs).
 *
 * A candidate is loaded by swapping `params.w` of the drive stages of the LOADED world instance
 * (`applyMazeCandidate`) — the exported `world.json` keeps the deployed best baked in (on-disk gate untouched),
 * the dialog shows which candidate drives and the scores in the meta.json describe the deployed one.
 */

import type { RennWorld } from '@/types/world'
import { N_IN_V3, hiddenOfLength, POLICY_STAGE_ID } from './policy'

/** One loadable candidate model (v3 26-input layout, any hidden size: `genome.length` = 29 H + 2, e.g. 698 for H = 24, 930 for H = 32). */
export interface MazeCandidate {
  /** Stable chip id (`island-0..2`, `best`, `shipped`) — also the localStorage key of the dialog selection. */
  id: string
  /** Chip label (`I1`, `Best`, `Shipped`). */
  label: string
  /** Generation the genome belongs to (islands: the current training gen; null when unknown). */
  gen: number | null
  genome: number[]
  /** Tooltip line (island age / origin / stagnation, best/shipped provenance). */
  detail: string
  /**
   * Headless per-world scores of THIS genome (export-maze-candidates.ts scores every candidate over all maze +
   * crux training worlds each watcher cycle): best over cars + the per-route scores, keyed by world id. The
   * dialog's health dots follow the selected candidate's scores; missing on older deploys (dots stay gray).
   */
  scores?: Record<string, { best: number; routes: Array<number | null> }>
  /** Generation the scores were measured at (the genomes move every gen; scores belong to the snapshot they shipped with). */
  scoredGen?: number | null
}

/** Shape of `public/policy-evolution/candidates.json` (schema `renn.policy-evolution.candidates/1`). */
export interface MazeCandidatesFile {
  schema: string
  source: string
  policy: string
  gen: number | null
  updatedAt: string
  candidates: MazeCandidate[]
}

/** Fetches the exported candidates; null when the file is missing (older deploy) or unparseable. */
export async function fetchMazeCandidates(baseUrl: string): Promise<MazeCandidatesFile | null> {
  try {
    const res = await fetch(`${baseUrl}policy-evolution/candidates.json`, { cache: 'no-cache' })
    if (!res.ok) return null
    const file = (await res.json()) as MazeCandidatesFile
    if (!Array.isArray(file.candidates)) return null
    return file
  } catch {
    return null
  }
}

/**
 * Swaps the drive-stage weights (`params.w`) of every policy car of the LOADED world instance to the candidate's
 * genome — same pattern as `focusMazeRoute`: deep clone, mutate params, return; the file on disk is never touched.
 * Throws when the genome is not v3-shaped (a v2/legacy candidate cannot drive a v3 stage); the hidden size may
 * DIFFER from the baked-in one (the v3 stage infers H from `params.w.length`, so an H=32 widen-freeze candidate
 * can drive the H=24 training worlds).
 */
export function applyMazeCandidate(world: RennWorld, candidate: MazeCandidate): RennWorld {
  if (!hiddenOfLength(candidate.genome.length, N_IN_V3)) {
    throw new Error(`applyMazeCandidate: candidate ${candidate.id} has ${candidate.genome.length} weights — not a v3 genome (29 H + 2)`)
  }
  const w = JSON.parse(JSON.stringify(world)) as {
    transformers?: Record<string, { params?: Record<string, unknown> }>
  }
  let swapped = 0
  for (const [id, transformer] of Object.entries(w.transformers ?? {})) {
    if (!id.startsWith(`${POLICY_STAGE_ID}_`) || !transformer.params || !Array.isArray(transformer.params.w)) continue
    transformer.params.w = candidate.genome.slice()
    swapped++
  }
  if (swapped === 0) throw new Error(`applyMazeCandidate: no drive stage (${POLICY_STAGE_ID}_*) with params.w found`)
  return w as unknown as RennWorld
}
