/**
 * Best-checkpoint selection of the schlau runs (critique 2026-10-23, REPORT.md §0): FINISH COUNT FIRST, the
 * ascending lexicographic episode-value vector only as the TIE-BREAK.
 *
 * Why not the pure lex order (es.ts beatsBest): a FAIL outcome (stall/offcourse/crash) gets a near-0 value
 * slot that is never EXACTLY 0, so the lex vector preferred a degenerate creeper (values like
 * [0.0003, 0.0004, ...], 0/26 finishes, drives 1-30 m and stalls) over the actually-driving island center
 * (14/16 train finishes but true 0s at the front of its vector) — the stored best.genome of the finished
 * base run is that creeper. Scoped to the schlau runner: es.ts (shared with v3) stays untouched.
 */

/** The checkpoint fitness of one candidate: TRAIN finishes (primary) + the ascending episode-value vector (tie-break). */
export interface SchlauCheckpointFitness {
  /** finished episodes of the TRAIN band — the primary key */
  finishes: number
  /** ascending episode-value vector (es.ts episodeValues) — the tie-break */
  vec: readonly number[]
}

/** Ascending-vector lex order: the first differing slot decides; missing trailing slots read 0. */
const lexGreater = (a: readonly number[], b: readonly number[]): boolean => {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

/**
 * Does the candidate beat the incumbent best? More TRAIN finishes always win; on equal finishes the lex
 * vector decides (the old es.ts order). An incumbent without a finish count (a legacy run file from before
 * this field existed) reads as 0 finishes — correct for the one legacy file in play (the base run's stored
 * best IS the 0-finish creeper, critique-measured).
 */
export function beatsBestSchlau(candidate: SchlauCheckpointFitness, incumbent?: SchlauCheckpointFitness): boolean {
  if (!incumbent) return true
  const incFinishes = incumbent.finishes ?? 0
  if (candidate.finishes !== incFinishes) return candidate.finishes > incFinishes
  return lexGreater(candidate.vec, incumbent.vec)
}
