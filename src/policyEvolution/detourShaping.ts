import type { V2 } from '@/avEvolution/eval/geometry'

/**
 * FITNESS SHAPING for the direct-line detour kinds (`blockade` / `blocks`) — credit for laterally passing
 * the wall plane (design + critic record: test-results/policy-evolution/fitness-shaping/DESIGN.md,
 * CRITIC.md). The measured zero-credit gap: the credited arc is the perpendicular FOOT of the car on the
 * direct line, so it follows the car's z the whole approach and LATERAL meters convert to zero arc credit —
 * every partial swing toward an opening pays the quarter-weight deviation penalty and banks nothing, a
 * strictly negative gradient (blockade 0/24 finishes at every geometry, ESCALATION.md).
 *
 * The shaper fixes the sign of that gradient, OPT-IN only (run-level `--detour-shaping`): while the car is
 * within NEIGH_M of the next wall the direct line passes through (a GATE), lateral progress toward that
 * gate's OPENING pays a small bonus — `WEIGHT x (distance-to-opening reduction, capped at CAP_M) /
 * routeLength` in norm currency, as a per-gate HIGH-WATER. Anti-cheese (audit list in DESIGN.md §4):
 * wrong-side swings pay 0 (the distance grows), oscillation / overshoot / re-crossing cannot exceed the
 * high-water, each gate closes permanently once the car passes its plane, at most one phase is open, a
 * sub-MIN_OPEN_M slit is not an opening, and free runs touching the plaza edge are not openings — the
 * total is bounded by SUM over gates of WEIGHT x min(d0, CAP_M) / routeLength, an episode-static bound.
 */
export const DETOUR_SHAPING = {
  /** lateral metres -> route metres (before the /routeLength normalization to norm currency) */
  WEIGHT: 1.0,
  /** per-gate bound on payable lateral progress (the demonstrated learnable swing band) */
  CAP_M: 22,
  /** the gate's phase is active while the car's arc is within this range before its plane (the ray range) */
  NEIGH_M: 50,
  /** a free run must be at least this wide to count as an opening (hull 4 m + 1 — a slit is not a corridor) */
  MIN_OPEN_M: 5,
  /** walls whose plane sits within this distance form one gate cluster */
  PLANE_CLUSTER_M: 1,
} as const

/** hull radius of the policy car (CAR_SIZE [4, 8] of episode.ts; kept local — the episode must not import-cycle) */
const HULL_R_M = Math.hypot(4, 8) / 2

/**
 * A course wall the way episode.ts builds it (rectPoly corner poly + bounding circle). Only the corner poly
 * is load-bearing — the plane and lateral extents are derived from the corners, so any { poly } satisfies
 * the seam (the episode's wall objects structurally).
 */
export type ShapingWall = { poly: V2[] } & Record<string, unknown>

/** a computed gate: a wall cluster the direct line passes through, with its payable openings (the pure geometry half of the shaper) */
export interface DetourGate {
  /** arc position of the wall plane along the chain */
  s: number
  /** half extent of the cluster's walls along the chain (m) */
  halfS: number
  /** open lateral intervals at the plane (empty = no payable opening; the phase is dead) */
  opens: Array<[number, number]>
}

interface GatePhase extends DetourGate {
  /** lateral distance to the opening captured at phase open (once); undefined = phase not yet open, null = dead */
  d0: number | null | undefined
  /** banked high-water bonus (norm currency) */
  bonus: number
  closed: boolean
}

/** exact lat interval where the convex wall poly crosses the arc position `s` (empty when it does not); corners are [s, lat] */
function wallLatIntervalAtS(corners: V2[], s: number): [number, number] | undefined {
  let lo = Infinity
  let hi = -Infinity
  let straddles = false
  const n = corners.length
  for (let i = 0; i < n; i++) {
    const a = corners[i]!
    const b = corners[(i + 1) % n]!
    if ((a[0] - s) * (b[0] - s) < 0) {
      const f = (s - a[0]) / (b[0] - a[0])
      const lat = a[1] + (b[1] - a[1]) * f
      lo = Math.min(lo, lat)
      hi = Math.max(hi, lat)
      straddles = true
    } else if (a[0] === s) {
      lo = Math.min(lo, a[1])
      hi = Math.max(hi, a[1])
      straddles = true
    }
  }
  return straddles ? [lo, hi] : undefined
}

/** distance from `lat` to the nearest open interval (0 when inside one; always >= 0) */
function distToOpen(lat: number, opens: Array<[number, number]>): number {
  let best = Infinity
  for (const [lo, hi] of opens) {
    if (lat >= lo && lat <= hi) return 0
    best = Math.min(best, lat < lo ? lo - lat : lat - hi)
  }
  return best
}

/**
 * Per-episode shaper for ONE direct-line chain (v3 `blockade` / `blocks` only — the chain is the direct
 * start -> target line, exactly 2 points; anything else throws loud). `walls` is the SAME array the
 * episode's touch test and WallLos use. `step(carX, carZ)` advances the state machine once per frame and
 * returns the TOTAL bonus banked so far (norm currency); the episode writes the final value into
 * `metrics.shapingBonus`, and es.ts `episodeValues` adds it to the peakNorm value (times V3_FAIL_FACTOR
 * on failed outcomes — a finish still dominates by ~10x).
 */
/**
 * Compute the gates of one direct-line chain: wall clusters the line passes through, each with the exact
 * open lateral intervals at its plane (covered = every wall's exact lat interval where it crosses the
 * plane; openings = free runs BETWEEN covered runs — boundary-touching runs are outside the plaza and do
 * not pay — of at least MIN_OPEN_M). Pure geometry, deterministic; exported for diagnostics and audits.
 */
export function detourGates(chain: V2[], walls: ShapingWall[], routeLength: number): DetourGate[] {
  if (chain.length !== 2) throw new Error(`detourGates needs the direct 2-point chain of a direct-line kind, got ${chain.length} points`)
  const p0 = chain[0]!
  const dx = chain[1]![0] - p0[0]
  const dz = chain[1]![1] - p0[1]
  const len = Math.hypot(dx, dz)
  if (!(len > 0) || !(routeLength > 0)) throw new Error('detourGates needs a non-degenerate chain and route length')
  const d: V2 = [dx / len, dz / len]
  const n: V2 = [-d[1], d[0]]
  // every wall in the chain frame: corner (s, lat) coords
  const framed = walls.map((w) => {
    const cs = w.poly.map((p) => [(p[0] - p0[0]) * d[0] + (p[1] - p0[1]) * d[1], (p[0] - p0[0]) * n[0] + (p[1] - p0[1]) * n[1]] as V2)
    const ss = cs.map((c) => c[0])
    const sMin = Math.min(...ss)
    const sMax = Math.max(...ss)
    return { sc: (sMin + sMax) / 2, sMin, sMax, corners: cs }
  })
  // cluster walls by plane; a cluster is a GATE iff the direct line (lat 0, s in [0, routeLength]) passes through one of its walls
  const gates: DetourGate[] = []
  const byPlane = [...framed].sort((a, b) => a.sc - b.sc)
  for (let i = 0; i < byPlane.length; ) {
    let j = i + 1
    while (j < byPlane.length && byPlane[j]!.sc - byPlane[j - 1]!.sc <= DETOUR_SHAPING.PLANE_CLUSTER_M) j++
    const cluster = byPlane.slice(i, j)
    i = j
    // exact s-interval where the line lat = 0 crosses each wall; overlap with the chain = gate
    const gateWall = cluster.find((w) => {
      let lo = Infinity
      let hi = -Infinity
      let straddles = false
      for (let k = 0; k < w.corners.length; k++) {
        const a = w.corners[k]!
        const b = w.corners[(k + 1) % w.corners.length]!
        if (a[1] * b[1] < 0) {
          const f = -a[1] / (b[1] - a[1])
          const s = a[0] + (b[0] - a[0]) * f
          lo = Math.min(lo, s)
          hi = Math.max(hi, s)
          straddles = true
        } else if (a[1] === 0) {
          lo = Math.min(lo, a[0])
          hi = Math.max(hi, a[0])
          straddles = true
        }
      }
      return straddles && hi > 0 && lo < routeLength
    })
    if (!gateWall) continue
    const s = cluster.reduce((a, w) => a + w.sc, 0) / cluster.length
    const halfS = Math.max(...cluster.map((w) => (w.sMax - w.sMin) / 2))
    // covered lat intervals of ALL walls crossing the plane, merged; openings = free runs between them
    const covered: Array<[number, number]> = []
    for (const w of framed) {
      const iv = wallLatIntervalAtS(w.corners, s)
      if (iv) covered.push(iv)
    }
    covered.sort((a, b) => a[0] - b[0])
    const merged: Array<[number, number]> = []
    for (const iv of covered) {
      const last = merged[merged.length - 1]
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1])
      else merged.push([iv[0], iv[1]])
    }
    const opens: Array<[number, number]> = []
    for (let k = 0; k + 1 < merged.length; k++) {
      const lo = merged[k]![1]
      const hi = merged[k + 1]![0]
      if (hi - lo >= DETOUR_SHAPING.MIN_OPEN_M) opens.push([lo, hi])
    }
    gates.push({ s, halfS, opens })
  }
  return gates.sort((a, b) => a.s - b.s)
}

export class DetourShaping {
  private readonly gates: GatePhase[]
  private readonly p0: V2
  private readonly d: V2
  private readonly n: V2
  private readonly routeLength: number

  constructor(chain: V2[], walls: ShapingWall[], routeLength: number) {
    const p0 = chain[0]!
    const dx = chain[1]![0] - p0[0]
    const dz = chain[1]![1] - p0[1]
    const len = Math.hypot(dx, dz)
    this.p0 = p0
    this.d = [dx / len, dz / len]
    this.n = [-this.d[1], this.d[0]]
    this.routeLength = routeLength
    this.gates = detourGates(chain, walls, routeLength).map((g) => ({ ...g, d0: g.opens.length ? undefined : null, bonus: 0, closed: false }))
  }

  /** advance once per frame with the car CENTER position; returns the total bonus banked so far (norm currency) */
  step(carX: number, carZ: number): number {
    const s = (carX - this.p0[0]) * this.d[0] + (carZ - this.p0[1]) * this.d[1]
    const lat = (carX - this.p0[0]) * this.n[0] + (carZ - this.p0[1]) * this.n[1]
    // gates the car has fully passed close permanently (banked high-water stays)
    for (const g of this.gates) {
      if (!g.closed && s > g.s + g.halfS + HULL_R_M) g.closed = true
      else break
    }
    // the active gate: the NEAREST unclosed gate ahead within NEIGH_M (at most one phase at a time)
    const g = this.gates.find((x) => !x.closed && s > x.s - DETOUR_SHAPING.NEIGH_M)
    if (g && g.d0 !== null) {
      const d = distToOpen(lat, g.opens)
      if (g.d0 === undefined) g.d0 = d
      else {
        const progress = Math.min(DETOUR_SHAPING.CAP_M, Math.max(0, g.d0 - d))
        const bonus = (DETOUR_SHAPING.WEIGHT * progress) / this.routeLength
        if (bonus > g.bonus) g.bonus = bonus
      }
    }
    return this.gates.reduce((a, x) => a + x.bonus, 0)
  }
}
