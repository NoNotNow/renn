import { GENOME_LENGTH_V2, N_HIDDEN, N_IN_V2, N_OUT, N_RAYS } from './policy'

/**
 * Hand-wired v2 pure-pursuit genome for tests / sanity checks: steer = tanh(2 tanh(5 x aimLeft)), speed target = `speed` x 30 m/s.
 * Proves that the chains are drivable and the dynamic command works end to end.
 */
export function pursuitV2(speed = 0.35, slow = 0): number[] {
  const w = new Array<number>(GENOME_LENGTH_V2).fill(0)
  const o2 = N_HIDDEN * N_IN_V2 + N_HIDDEN
  w[0 * N_IN_V2 + N_RAYS + 4] = 5
  w[o2 + 0 * N_HIDDEN + 0] = 2
  w[GENOME_LENGTH_V2 - N_OUT + 1] = speed
  if (slow > 0) {
    // hidden 1 = tanh(3 (1 - aim cos)) ~ how far the aim point is off the heading; the speed target drops by `slow`
    w[1 * N_IN_V2 + N_RAYS + 3] = -3
    w[N_HIDDEN * N_IN_V2 + 1] = 3
    w[o2 + 1 * N_HIDDEN + 1] = -slow
  }
  return w
}
