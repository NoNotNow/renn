import type { V2 } from '@/avEvolution/eval/geometry'
import { WallLos } from './wallLos'

/**
 * Leg-wise chain progress (v3, spec-command-chains.md section v3). A chain is a polyline split into LEGS at the point indices `legEnds` (leg k runs from
 * point legEnds[k-1] (0 for the first) to point legEnds[k]; a chain without `legEnds` is ONE leg). Chains may double back (reversal legs point the way the car
 * came from), where the projection onto the whole polyline is ambiguous. So the leg index only advances when the car is within `reach` of the leg end (or past
 * it along the leg, near the leg), and
 *   progress = length of the completed legs + the (monotone) projection onto the CURRENT leg only;
 *   offcourse = distance to the current leg.
 * The tracker is plain JS in a string: the episode (via `new Function`) and the policy stage (inside the transformer code) run the IDENTICAL code, so the leg the
 * car is scored on and the leg it is commanded along cannot diverge.
 */
export const LEG_TRACK_JS = `
function legInit(ch, ends) {
  var n = ch.length
  var cum = [0]
  for (var q = 1; q < n; q++) cum.push(cum[q - 1] + Math.hypot(ch[q][0] - ch[q - 1][0], ch[q][1] - ch[q - 1][1]))
  var es = ends && ends.length ? ends : [n - 1]
  var legs = []
  var a = 0
  for (var k = 0; k < es.length; k++) {
    var len = cum[es[k]] - cum[a]
    legs.push({ a: a, b: es[k], s0: cum[a], len: len, reach: Math.min(5, Math.max(2.5, 0.4 * len)) })
    a = es[k]
  }
  return { ch: ch, cum: cum, legs: legs, li: 0, s: 0, seg: 0, done: false, dist: 0, doneLen: 0, total: cum[n - 1], off: 6 }
}
function legStep(t, px, pz) {
  if (t.done) return
  var L = t.legs[t.li]
  var ch = t.ch
  var bestD = Infinity, bestS = t.s, bestSeg = Math.max(L.a, t.seg)
  for (var i = Math.max(L.a, t.seg - 1); i <= Math.min(L.b - 1, t.seg + 2); i++) {
    var ax = ch[i][0], az = ch[i][1]
    var dx = ch[i + 1][0] - ax, dz = ch[i + 1][1] - az
    var len2 = dx * dx + dz * dz || 1
    var u = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2))
    var d = Math.hypot(px - (ax + u * dx), pz - (az + u * dz))
    if (d < bestD) {
      bestD = d
      bestS = t.cum[i] - L.s0 + u * Math.sqrt(len2)
      bestSeg = i
    }
  }
  t.seg = bestSeg
  t.dist = bestD
  if (bestS > t.s) t.s = bestS
  var e = ch[L.b]
  var endD = Math.hypot(px - e[0], pz - e[1])
  if (endD < L.reach || (t.s >= L.len - 1e-6 && bestD <= t.off)) {
    if (t.li >= t.legs.length - 1) {
      t.done = true
      t.s = L.len
    } else {
      t.doneLen += L.len
      t.li++
      t.s = 0
      t.seg = t.legs[t.li].a
    }
  }
}
function legProgress(t) {
  return t.done ? t.total : t.doneLen + t.s
}
function legPoint(t, leg, s) {
  var ch = t.ch, cum = t.cum
  var target = leg.s0 + Math.max(0, Math.min(s, leg.len))
  var i = leg.a
  while (i < leg.b - 1 && cum[i + 1] < target) i++
  var seglen = (cum[i + 1] - cum[i]) || 1
  var f = (target - cum[i]) / seglen
  return [ch[i][0] + (ch[i + 1][0] - ch[i][0]) * f, ch[i][1] + (ch[i + 1][1] - ch[i][1]) * f]
}
`

interface LegTrackState {
  li: number
  s: number
  done: boolean
  dist: number
  off: number
  legs: Array<{ a: number; b: number; s0: number; len: number; reach: number }>
}
interface LegApi {
  legInit(ch: V2[], ends?: number[]): LegTrackState
  legStep(t: LegTrackState, x: number, z: number): void
  legProgress(t: LegTrackState): number
  legPoint(t: LegTrackState, leg: LegTrackState['legs'][number], s: number): V2
}
let api: LegApi | undefined
const legApi = (): LegApi =>
  (api ??= new Function(
    `${LEG_TRACK_JS}; return { legInit: legInit, legStep: legStep, legProgress: legProgress, legPoint: legPoint }`,
  )() as LegApi)

/** TS handle on the shared leg tracker (the same code the policy stage runs). */
export class LegProgress {
  private readonly t: LegTrackState
  private readonly los?: WallLos
  /** LOS-gated credit high-water (only advanced when the credit vector was wall-free); equals the raw progress without `los` */
  private credited = 0
  /** distance of the last position to the current leg (m) */
  get lastDist(): number {
    return this.t.dist
  }
  get leg(): number {
    return this.t.li
  }
  get legCount(): number {
    return this.t.legs.length
  }
  /** all legs completed */
  get done(): boolean {
    return this.t.done
  }
  /** best (monotone) progress: completed legs + projection onto the current leg; the full length once done — with `los`, the OCCLUSION-GATED credit high-water */
  get progress(): number {
    return this.los ? this.credited : legApi().legProgress(this.t)
  }

  /** the raw tracker progress without the line-of-sight gate (diagnostics / tests: the occluded share = raw - credited) */
  get progressRaw(): number {
    return legApi().legProgress(this.t)
  }

  /**
   * `legEnds`: point indices where the legs end (see above); undefined = one leg. `offM` is only used for the "past the
   * leg end" test. `los` (v3 episodes): the wall line-of-sight of the course — progress credit is only given on frames
   * where the segment car -> projected chain point crosses no wall (a projection onto a chain point behind a wall is
   * NOT credit the car drove); the previous credit stands while occluded, the aim input of the net is unaffected.
   */
  constructor(points: V2[], legEnds?: number[], offM = 6, los?: WallLos) {
    this.t = legApi().legInit(points, legEnds)
    this.t.off = offM
    this.los = los
  }

  update(x: number, z: number): number {
    legApi().legStep(this.t, x, z)
    if (!this.los) return legApi().legProgress(this.t)
    const raw = legApi().legProgress(this.t)
    // finish credits in full: the reach test is a physical proximity to the leg end, not a projection
    if (this.t.done) this.credited = raw
    else {
      // the projected chain point this frame's credit refers to (the tracker's own projection on the current leg)
      const p = legApi().legPoint(this.t, this.t.legs[this.t.li]!, this.t.s)
      if (!this.los.blocked(x, z, p[0], p[1])) this.credited = raw
    }
    return this.credited
  }
}
