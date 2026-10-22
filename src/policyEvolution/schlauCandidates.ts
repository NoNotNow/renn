/**
 * Schlau candidate models for the training dialog's "Schlau" car: the same candidates-file shape as the v3 maze
 * candidates (`MazeCandidatesFile`), but the genomes are SCHLAU-shaped (26 inputs, len = 29 H + 2, policy
 * 'schlau' — see schlauPolicy.ts) and the file is exported by tools/policy-evolution/export-schlau-candidates.ts
 * into `public/policy-evolution/schlau-candidates.json`. Applying a candidate swaps the weights of the schlau drive
 * stages of the LOADED world instance (`applySchlauCandidate` in schlauTraining.ts) — the exported world.json keeps
 * the deployed candidate baked in.
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
