/**
 * Schlau candidate models for the training dialog's "Schlau" car: the same candidates-file shape as the v3 maze
 * candidates (`MazeCandidatesFile`), but the genomes are SCHLAU-shaped (26 inputs, policy 'schlau' — see
 * schlauPolicy.ts) and the file is exported by tools/policy-evolution/export-schlau-candidates.ts into
 * `public/policy-evolution/schlau-candidates.json`. Applying a candidate swaps the weights of the schlau drive
 * stages of the LOADED world instance (`applySchlauCandidate` in schlauTraining.ts) — the exported world.json keeps
 * the deployed candidate baked in.
 *
 * NET VERSIONING (deep schlau, handoff 2026-10-23 Task 2): a candidate is EITHER net — 1-layer ('schlau',
 * len = 29 H + 2, the fallback) or deep ('schlau2', two hidden layers, len = H^2 + 30 H + 2, schlauDeep.ts). The
 * exporter tags every entry with `net`; the two length sets are DISJOINT by construction, so an OLD file (all
 * 1-layer, no tags) loads honestly as the fallback net — no genome is ever silently interpreted as the other net.
 * Both nets drive the same worlds (the stage code is dual-mode); the swap refuses a deep candidate only for a
 * stage that predates the deep support.
 */
import type { MazeCandidatesFile } from './mazeCandidates'

/** Fetches the exported schlau candidates; null when the file is missing (older deploy / nothing exported yet) or unparseable. */
export async function fetchSchlauCandidates(baseUrl: string): Promise<MazeCandidatesFile | null> {
  try {
    const res = await fetch(`${baseUrl}policy-evolution/schlau-candidates.json`, { cache: 'no-cache' })
    if (!res.ok) return null
    const file = (await res.json()) as MazeCandidatesFile
    if (!Array.isArray(file.candidates)) return null
    return file
  } catch {
    return null
  }
}
