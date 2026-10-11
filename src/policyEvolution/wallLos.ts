import type { V2 } from '@/avEvolution/eval/geometry'

/**
 * Wall line-of-sight for progress credit (spec: "when there is a wall between the vector and the car the points
 * should not count"). The "vector" is the drawn carrot / credit vector from the car to its PROJECTED chain point —
 * the point the arc-length progress is credited to — never the aim input of the net (that stays untouched).
 *
 * The test is pure 2-D geometry: the credit counts only when no course wall rect crosses the segment
 * car -> projected chain point. Plain JS in a string, shared by both pipelines so they cannot diverge:
 * - the episode tracker (`LegProgress`, src/policyEvolution/legs.ts — the headless training run),
 * - the in-world score stage (MAZE_SCORE_STAGE_CODE, src/policyEvolution/mazeTraining.ts, embeds this string;
 *   its params carry the wall rects of the car's maze copy).
 *
 * Rays via `api.raycast` were rejected for this: the transformer raycast has no self-exclusion (the origin inside
 * the car hull self-hits; the removed escape stage had to offset every ray to the hull edge), it hits ANY collider
 * (goal slabs, other cars — needing per-entity filtering) and it needs a live physics world. The param rects are
 * exact, deterministic and cheap.
 */
export const WALL_LOS_JS = `
function losWallsInit(walls) {
  // cache per wall: the corner poly plus a bounding circle (center + radius) for the early rejection
  var out = []
  for (var i = 0; i < walls.length; i++) {
    var w = walls[i], cx = 0, cz = 0
    for (var k = 0; k < 4; k++) { cx += w[k][0]; cz += w[k][1] }
    cx /= 4
    cz /= 4
    var r = 0
    for (var k2 = 0; k2 < 4; k2++) {
      var d = Math.hypot(w[k2][0] - cx, w[k2][1] - cz)
      if (d > r) r = d
    }
    out.push({ w: w, cx: cx, cz: cz, r: r })
  }
  return out
}
function losBlocked(ws, ax, az, bx, bz) {
  // true when any wall poly crosses the segment a -> b (the car -> chain-point credit vector)
  var dx = bx - ax, dz = bz - az
  var len2 = dx * dx + dz * dz
  if (len2 === 0) return false
  for (var i = 0; i < ws.length; i++) {
    var e = ws[i]
    // bounding-circle early rejection: the wall cannot cross the segment when its circle does not reach it
    var t = ((e.cx - ax) * dx + (e.cz - az) * dz) / len2
    if (t < 0) t = 0
    if (t > 1) t = 1
    if (Math.hypot(e.cx - (ax + t * dx), e.cz - (az + t * dz)) > e.r) continue
    var w = e.w
    for (var k = 0; k < 4; k++) {
      var x1 = w[k][0], z1 = w[k][1]
      var x2 = w[(k + 1) % 4][0], z2 = w[(k + 1) % 4][1]
      var d1 = (x2 - x1) * (az - z1) - (z2 - z1) * (ax - x1)
      var d2 = (x2 - x1) * (bz - z1) - (z2 - z1) * (bx - x1)
      if ((d1 > 0) === (d2 > 0)) continue
      var d3 = (bx - ax) * (z1 - az) - (bz - az) * (x1 - ax)
      var d4 = (bx - ax) * (z2 - az) - (bz - az) * (x2 - ax)
      if ((d3 > 0) === (d4 > 0)) continue
      return true
    }
  }
  return false
}
`

interface LosWallEntry {
  w: V2[]
  cx: number
  cz: number
  r: number
}
interface LosApi {
  losWallsInit(walls: V2[][]): LosWallEntry[]
  losBlocked(ws: LosWallEntry[], ax: number, az: number, bx: number, bz: number): boolean
}
let api: LosApi | undefined
const losApi = (): LosApi =>
  (api ??= new Function(`${WALL_LOS_JS}; return { losWallsInit: losWallsInit, losBlocked: losBlocked }`)() as LosApi)

/**
 * Wall line-of-sight for one course: the wall rect corner polys (`rectPoly` output) preprocessed with bounding
 * circles. Plain data, no physics — the same geometry the hull-vs-wall `polyGap` touch test already uses.
 */
export class WallLos {
  private readonly ws: LosWallEntry[]

  constructor(polys: V2[][]) {
    this.ws = losApi().losWallsInit(polys)
  }

  /** true when any wall crosses the segment (ax, az) -> (bx, bz): the credit vector is occluded, no progress. */
  blocked(ax: number, az: number, bx: number, bz: number): boolean {
    return losApi().losBlocked(this.ws, ax, az, bx, bz)
  }
}
