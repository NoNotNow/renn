/**
 * The DEEP schlau net ("schlau v2", handoff 2026-10-23 Task 2): TWO hidden layers of equal width H instead of the
 * single-hidden-layer MLP — the head can express sequenced, state-dependent maneuvers like the multi-point shunt
 * rotation of the goal_turn tasks. Same 26 inputs and same (steer, speed-target) outputs as the 1-layer schlau net
 * (schlauPolicy.ts), which stays fully functional as the FALLBACK; a deep candidate only replaces the shipped one
 * after it beats the 1-layer bests (a LATER training phase, never this module).
 *
 * Genome layout (H = per-layer width, all offsets are genome indices):
 *   W1  H x 26   (row-major: w[j * 26 + i] = weight of input i into layer-1 unit j)
 *   b1  H        (w[26 H + j])
 *   W2  H x H    (row = layer-2 unit, column = layer-1 unit: w[o1 + j2 * H + i1], o1 = 26 H + H)
 *   b2  H        (w[o1 + H*H + j2])
 *   W3  2 x H    (w[o2 + k * H + j], o2 = o1 + H*H + H)
 *   b3  2        (w[o2 + 2 H + k])
 * Length: H^2 + 30 H + 2  (26 H + H + H^2 + H + 2 H + 2).
 *
 * SHAPE COLLISION, RESOLVED BY CONSTRUCTION: the 1-layer lengths are 29 H + 2 (schlau AND v3 share that formula),
 * the deep lengths are H^2 + 30 H + 2. H^2 + 30 H = H (H + 30) = H (H + 1) mod 29, so a deep length is ALSO a
 * 1-layer length exactly when H = 0 or 28 (mod 29). The deep helpers FORBID those widths (genomeLengthSchlau2
 * throws, hiddenOfSchlau2 returns 0) — the valid deep and 1-layer length sets are therefore DISJOINT in both
 * directions: `hiddenOfSchlau` rejects every valid deep genome and `hiddenOfSchlau2` rejects every 1-layer genome,
 * so a length is an unambiguous net (schlauNetOf) and candidate files can never silently load a genome as the
 * other net. The colliding widths (e.g. deep H = 28 has the length of the 1-layer H = 56) simply do not exist as
 * deep nets. The v1/v2 length formulas also intersect some deep lengths (deep H = 6 reads as v2-H-8 inside
 * `genomeShape`), so deep genomes must NEVER reach the genomeShape-based helpers (`widenHidden`, `freezeOldMask`,
 * `crossoverNeurons`, the default `initialIslands` fresh path): the deep training path injects its own factories
 * (islands.ts `fresh` / IslandEs opts) and runs with crossover OFF (deep crossover is future work, see handoffs).
 *
 * Version tags: run files / candidates / exports carry `net: 'schlau2'` (SCHLAU2_NET) for deep genomes; an absent
 * net field reads as the 1-layer net. The tag is documentation — the genome length alone decides which forward
 * pass runs (the stage reads the shape off params.w.length), so an old export is never misinterpreted.
 */
import { gaussian, type Rng } from '@/avEvolution/core/rng'
import { DEFAULT_ES_CONFIG } from './es'
import { hiddenOfSchlau, N_IN_SCHLAU, N_OUT_SCHLAU } from './schlauPolicy'

/** Net tag of the deep variant (1-layer = 'schlau'; an absent net field reads as 1-layer). */
export const SCHLAU2_NET = 'schlau2'
/** The two schlau nets (a genome length resolves to exactly one of them or neither — see schlauNetOf). */
export type SchlauNet = 'schlau' | 'schlau2'

/** true when the width would make the deep length a 1-layer length too (H ≡ 0 or 28 mod 29) — forbidden. */
export function schlau2ForbiddenWidth(h: number): boolean {
  const r = ((h % 29) + 29) % 29
  return r === 0 || r === 28
}

/**
 * Length of a deep schlau genome with `hidden` units per hidden layer (H^2 + 30 H + 2). Throws on the forbidden
 * widths (H ≡ 0 / 28 mod 29): their lengths coincide with the 1-layer 29 H + 2 formula and the two nets would be
 * indistinguishable by length — the disjointness is load-bearing, see the module header.
 */
export function genomeLengthSchlau2(hidden: number): number {
  if (!Number.isInteger(hidden) || hidden < 1) throw new Error(`deep schlau hidden size must be an integer >= 1, got ${hidden}`)
  if (schlau2ForbiddenWidth(hidden))
    throw new Error(`deep schlau hidden size ${hidden} is forbidden: H ≡ 0 / 28 (mod 29) makes the length (H^2 + 30 H + 2) collide with the 1-layer formula (29 H + 2) — the two nets must stay distinguishable by length`)
  return hidden * hidden + 30 * hidden + 2
}

/** Width of a deep schlau genome (the unique integer root of H^2 + 30 H + 2 = len); 0 = not a deep length. */
export function hiddenOfSchlau2(len: number): number {
  // len - 2 = H^2 + 30 H  =>  disc = 900 + 4 (len - 2) = (2 H + 30)^2, a perfect square: Math.sqrt is exact here
  if (!Number.isInteger(len) || len < 33) return 0
  const s = Math.sqrt(900 + 4 * (len - 2))
  if (Math.abs(s - Math.round(s)) > 1e-9) return 0
  const h = (Math.round(s) - 30) / 2
  if (h < 1 || !Number.isInteger(h) || schlau2ForbiddenWidth(h)) return 0
  return h
}

/** The net a genome length resolves to: 'schlau' (1-layer), 'schlau2' (deep) or null (no schlau net — v1/v2/v3/garbage). */
export function schlauNetOf(len: number): SchlauNet | null {
  if (hiddenOfSchlau(len) >= 1) return 'schlau'
  if (hiddenOfSchlau2(len) >= 1) return 'schlau2'
  return null
}

/** Offset map of the deep layout (layer boundaries in the flat genome). */
export function schlau2Layout(h: number): { o1: number; o2: number; o3: number; b3: number; end: number } {
  const o1 = h * N_IN_SCHLAU + h // W2
  const o2 = o1 + h * h // b2
  const o3 = o2 + h // W3
  const b3 = o3 + N_OUT_SCHLAU * h
  return { o1, o2, o3, b3, end: b3 + N_OUT_SCHLAU }
}

/**
 * Reference forward pass of the deep schlau net; the stage (schlauPolicy.ts STAGE_NET_SCHLAU) computes the
 * identical thing. Throws on any non-deep length (the 1-layer pass lives in policyForwardSchlau).
 */
export function policyForwardSchlau2(w: ArrayLike<number>, x: ArrayLike<number>): [number, number] {
  const H = hiddenOfSchlau2(w.length)
  if (!H) throw new Error(`deep schlau forward: genome of ${w.length} numbers is not deep-schlau2-shaped (H^2 + 30 H + 2)`)
  const { o1, o2, o3 } = schlau2Layout(H)
  const h1 = new Array<number>(H)
  for (let j = 0; j < H; j++) {
    let s = w[H * N_IN_SCHLAU + j]!
    for (let i = 0; i < N_IN_SCHLAU; i++) s += w[j * N_IN_SCHLAU + i]! * x[i]!
    h1[j] = Math.tanh(s)
  }
  const h2 = new Array<number>(H)
  for (let j = 0; j < H; j++) {
    let s = w[o2 + j]!
    for (let i = 0; i < H; i++) s += w[o1 + j * H + i]! * h1[i]!
    h2[j] = Math.tanh(s)
  }
  const out: [number, number] = [0, 0]
  for (let k = 0; k < N_OUT_SCHLAU; k++) {
    let s = w[o3 + N_OUT_SCHLAU * H + k]!
    for (let j = 0; j < H; j++) s += w[o3 + k * H + j]! * h2[j]!
    out[k] = Math.tanh(s)
  }
  return out
}

/**
 * A fresh random deep genome: all weights gaussian * `initStd`, the speed-target bias b3[1] set to +0.5 (the same
 * start prior as freshGenome — without it random policies never roll forward and every fitness is 0).
 */
export function freshGenomeSchlau2(rng: Rng, initStd = DEFAULT_ES_CONFIG.initStd, hidden = 10): number[] {
  const g = Array.from({ length: genomeLengthSchlau2(hidden) }, () => gaussian(rng) * initStd)
  const { b3 } = schlau2Layout(hidden)
  g[b3 + 1] = 0.5
  return g
}

/**
 * Widen a deep genome to `newH` units per layer WITHOUT changing its function (the widenHidden pattern of
 * policy.ts, applied to both layers): the new layer-1 units get small random incoming weights (std 0.1 —
 * symmetry breaking) and ZERO outgoing weights (their W2 columns are 0, so they add nothing); the new layer-2
 * units get small random incoming weights from the OLD layer-1 units (std 0.1) and zero outgoing weights (their
 * W3 columns are 0). Everything the old function lives in is copied exactly — the outputs are bit-identical.
 */
export function widenHiddenSchlau2(genome: ArrayLike<number>, newH: number, rng: Rng): number[] {
  const oldH = hiddenOfSchlau2(genome.length)
  if (!oldH) throw new Error(`widenHiddenSchlau2: genome of ${genome.length} numbers is not deep-schlau2-shaped (H^2 + 30 H + 2)`)
  if (!Number.isInteger(newH) || newH < oldH) throw new Error(`widenHiddenSchlau2: new hidden size ${newH} must be an integer >= ${oldH}`)
  if (schlau2ForbiddenWidth(newH))
    throw new Error(`widenHiddenSchlau2: new hidden size ${newH} is forbidden (H ≡ 0 / 28 mod 29 collides with the 1-layer length formula)`)
  const old = schlau2Layout(oldH)
  const out = new Array<number>(genomeLengthSchlau2(newH)).fill(0)
  const { o1, o2, o3 } = schlau2Layout(newH)
  // W1 rows + b1: old copied exactly, new rows random (std 0.1), new biases 0
  for (let j = 0; j < newH; j++) {
    for (let i = 0; i < N_IN_SCHLAU; i++) out[j * N_IN_SCHLAU + i] = j < oldH ? genome[j * N_IN_SCHLAU + i]! : gaussian(rng) * 0.1
    out[newH * N_IN_SCHLAU + j] = j < oldH ? genome[oldH * N_IN_SCHLAU + j]! : 0
  }
  // W2 (newH x newH): the old block copied exactly; the new h1 COLUMNS all 0 (new layer-1 units silent — every row,
  // including the old h2 units); the new h2 ROWS random incoming from the OLD h1 units (std 0.1), 0 from the new ones
  for (let j2 = 0; j2 < newH; j2++) {
    for (let i1 = 0; i1 < newH; i1++) {
      if (j2 < oldH && i1 < oldH) out[o1 + j2 * newH + i1] = genome[old.o1 + j2 * oldH + i1]!
      else if (j2 >= oldH && i1 < oldH) out[o1 + j2 * newH + i1] = gaussian(rng) * 0.1
    }
  }
  // b2: old copied, new 0
  for (let j = 0; j < oldH; j++) out[o2 + j] = genome[old.o2 + j]!
  // W3: old columns copied (stride newH), new columns 0; b3 copied
  for (let k = 0; k < N_OUT_SCHLAU; k++) {
    for (let j = 0; j < oldH; j++) out[o3 + k * newH + j] = genome[old.o3 + k * oldH + j]!
    out[o3 + N_OUT_SCHLAU * newH + k] = genome[old.o3 + N_OUT_SCHLAU * oldH + k]!
  }
  return out
}

/**
 * Freeze mask for a WIDENED deep genome (see `widenHiddenSchlau2`): `true` = frozen. FROZEN = everything the old
 * function lives in — the old W1 rows, the old b1, the old W2 block (old rows AND old columns — the stride change
 * oldH → newH makes them non-contiguous), the old b2, the old W3 columns and BOTH output biases b3; FREE = exactly
 * the new units' parameters — the new W1 rows, the new b1, the new layer-1 units' W2 columns (they start 0 and must
 * evolve, else the new units are inert), the new h2 rows' incoming weights (random init), the new b2 and the new
 * W3 columns. The frozen set has exactly genomeLengthSchlau2(oldH) entries — the whole old genome.
 */
export function freezeOldMaskSchlau2(len: number, oldH: number): boolean[] {
  const newH = hiddenOfSchlau2(len)
  if (!newH) throw new Error(`freezeOldMaskSchlau2: length ${len} is not deep-schlau2-shaped (H^2 + 30 H + 2)`)
  if (!Number.isInteger(oldH) || oldH < 1 || oldH >= newH) throw new Error(`freezeOldMaskSchlau2: old hidden size ${oldH} must be an integer in [1, ${newH})`)
  const mask = new Array<boolean>(len).fill(true)
  const { o1, o2, o3 } = schlau2Layout(newH)
  for (let j = oldH; j < newH; j++) {
    for (let i = 0; i < N_IN_SCHLAU; i++) mask[j * N_IN_SCHLAU + i] = false // new W1 row
    mask[newH * N_IN_SCHLAU + j] = false // new b1
    mask[o2 + j] = false // new b2
    for (let k = 0; k < N_OUT_SCHLAU; k++) mask[o3 + k * newH + j] = false // new W3 column (stride newH)
  }
  for (let j2 = 0; j2 < newH; j2++) for (let i1 = oldH; i1 < newH; i1++) mask[o1 + j2 * newH + i1] = false // new h1 units' W2 columns (every row)
  for (let j2 = oldH; j2 < newH; j2++) for (let i1 = 0; i1 < oldH; i1++) mask[o1 + j2 * newH + i1] = false // new h2 rows' incoming weights
  return mask
}
