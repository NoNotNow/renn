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
import { POLICY_STAGE_ID } from './policy'

/** One loadable candidate model (v3 26-input layout, `genome.length` = 698 for H = 24). */
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
 * Throws when the genome length does not match the baked-in one (a v2-shaped candidate cannot drive a v3 stage).
 */
export function applyMazeCandidate(world: RennWorld, candidate: MazeCandidate): RennWorld {
  const w = JSON.parse(JSON.stringify(world)) as {
    transformers?: Record<string, { params?: Record<string, unknown> }>
  }
  let swapped = 0
  for (const [id, transformer] of Object.entries(w.transformers ?? {})) {
    if (!id.startsWith(`${POLICY_STAGE_ID}_`) || !transformer.params || !Array.isArray(transformer.params.w)) continue
    const baked = transformer.params.w as number[]
    if (candidate.genome.length !== baked.length) {
      throw new Error(`applyMazeCandidate: candidate ${candidate.id} has ${candidate.genome.length} weights, drive stage ${id} has ${baked.length}`)
    }
    transformer.params.w = candidate.genome.slice()
    swapped++
  }
  if (swapped === 0) throw new Error(`applyMazeCandidate: no drive stage (${POLICY_STAGE_ID}_*) with params.w found`)
  return w as unknown as RennWorld
}
