/**
 * Where and how do v3 episodes end? Read-only diagnosis of a v3 policy (default: the shipped one) per course kind over the TRAIN and HOLDOUT setups
 * exactly as ship.ts builds them (trainV3Episodes / holdoutV3Episodes, all chains of each setup). Single-threaded, deterministic, no training involved.
 *
 *   npx tsx tools/policy-evolution/diagnose-v3.ts [--kinds field,crowd,corridor] [--train-per-kind 8] [--holdout-per-kind 6] [--policy file.json] [--noise 0] [--hand 0.35] [--out raw.json] [--list]
 *
 * Per episode (via the `onFrame` hook of runPolicyEpisode) it records the end reason, the leg index / leg kind at the end (forward leg, or reversal leg =
 * the leg turns back against the previous leg / the start heading), the speed, the clearance (hull-to-box gap, forward / backward ray to the boxes) over the last
 * second and whether the straight line to the commanded aim point (8 m ahead on the current leg) runs through a box (raw, or with a 2 m margin = the car's half
 * width). Prints one table per (kind, split) plus aggregates; `--list` prints every failing episode, `--out` writes all records as JSON.
 */
import fs from 'node:fs'
import { chainClearance, holdoutV3Episodes, polylineLength, trainV3Episodes, chainOfEpisode, parseChainEpisodeKey } from '@/policyEvolution/chains'
import { buildSetupCourse, parseCourseKey, type CourseKind } from '@/policyEvolution/courses'
import { CAR_SIZE, runPolicyEpisode, type EpisodeOutcome } from '@/policyEvolution/episode'
import { shippedGenomeV3 } from '@/policyEvolution/exampleWorld'
import { pursuitV2 } from '@/policyEvolution/handWired'
import { LegProgress } from '@/policyEvolution/legs'
import { parseKinds } from '@/policyEvolution/chainReport'
import { V3_KINDS } from '@/policyEvolution/courses'
import { polyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'

const argv = process.argv.slice(2)
const arg = (n: string) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : undefined)
const num = (n: string, d: number) => (arg(n) !== undefined ? Number(arg(n)) : d)
const kinds = parseKinds(arg('kinds') ?? 'field,crowd,corridor', V3_KINDS)
const policyFile = arg('policy')
const handSpeed = arg('hand')
/** `--hand <s>`: the hand-wired pure-pursuit genome (target speed s x 30 m/s) instead of the net: a net-independent probe of how the finish rate depends on SPEED alone */
const genome: number[] = handSpeed !== undefined ? pursuitV2(Number(handSpeed)) : policyFile ? JSON.parse(fs.readFileSync(policyFile, 'utf8')).genome : (shippedGenomeV3() as number[])
const LOOKAHEAD = 8
const WIN_S = 1
/** sensor noise (relative); default = the training value (SENSOR_NOISE), 0 = noise free as in the example worlds */
const NOISE = arg('noise') !== undefined ? Number(arg('noise')) : undefined

interface Rec {
  split: 'train' | 'holdout'
  kind: CourseKind
  key: string
  outcome: EpisodeOutcome
  progress: number
  length: number
  frac: number
  timeS: number
  legCount: number
  legAtEnd: number
  legIsReverse: boolean
  chainHasReverse: boolean
  speedEnd: number
  speedMaxLast3s: number
  gapEnd: number
  gapMinLast1s: number
  fwdRayEnd: number
  backRayEnd: number
  aimBlocked: boolean
  aimBlockedMargin: boolean
  bearingErrDeg: number
  secondsSinceLegStart: number
  meanSpeed: number
  /** min over the chain of the free space beside the commanded polyline (chainClearance) and the lowest speed after the first 3 s */
  chainClear: number
  minSpeedAfter3s: number
  /** contact side of the car at the end: angle (deg, 0 = straight ahead, +-180 = behind) from the car centre to the nearest box point */
  contactAngleDeg: number
  /** slip angle at the end between velocity direction and heading (deg) */
  slipDeg: number
  /** speed / min of 5 rays over +-20 deg around the heading, 1 s and 0.5 s before the end */
  speed1s: number
  cone1s: number
  speed05s: number
  cone05s: number
  /** smallest hull gap over the whole episode before the last second (how close the SUCCESSFUL parts come) */
  minGapEarlier: number
}

function pointSegDist(px: number, pz: number, a: V2, b: V2): number {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const u = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(px - (a[0] + u * dx), pz - (a[1] + u * dz))
}

function rayBox(ox: number, oz: number, dx: number, dz: number, poly: V2[]): number {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!
    const ex = b[0] - a[0], ez = b[1] - a[1]
    const den = dx * ez - dz * ex
    if (Math.abs(den) < 1e-9) continue
    const t = ((a[0] - ox) * ez - (a[1] - oz) * ex) / den
    const u = ((a[0] - ox) * dz - (a[1] - oz) * dx) / den
    if (t >= 0 && u >= 0 && u <= 1 && t < best) best = t
  }
  return best
}

/** does the segment p->q come closer than `margin` to the polygon (margin 0: crosses / touches it)? */
function segNearPoly(p: V2, q: V2, poly: V2[], margin: number): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!
    const d1 = pointSegDist(a[0], a[1], p, q)
    if (d1 <= margin) return true
    if (pointSegDist(p[0], p[1], a, b) <= margin || pointSegDist(q[0], q[1], a, b) <= margin) return true
    // proper crossing
    const o = (r: V2, s: V2, t: V2) => (s[0] - r[0]) * (t[1] - r[1]) - (s[1] - r[1]) * (t[0] - r[0])
    if (o(p, q, a) * o(p, q, b) < 0 && o(a, b, p) * o(a, b, q) < 0) return true
  }
  // segment fully inside the polygon is impossible for a start point outside; treat start inside as blocked
  return false
}

const inside = (pt: V2, poly: V2[]) => {
  let pos = 0, neg = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!
    const c = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0])
    if (c > 0) pos++
    else neg++
  }
  return pos === 0 || neg === 0
}

function pointAhead(points: V2[], a: number, b: number, x: number, z: number, dist: number): V2 {
  let bestI = a, bestU = 0, bestD = Infinity
  for (let i = a; i < b; i++) {
    const p = points[i]!, q = points[i + 1]!
    const dx = q[0] - p[0], dz = q[1] - p[1]
    const u = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / (dx * dx + dz * dz || 1)))
    const d = Math.hypot(x - (p[0] + u * dx), z - (p[1] + u * dz))
    if (d < bestD) { bestD = d; bestI = i; bestU = u }
  }
  let rest = dist
  let i = bestI
  let p = points[i]!, q = points[i + 1]!
  let cur: V2 = [p[0] + (q[0] - p[0]) * bestU, p[1] + (q[1] - p[1]) * bestU]
  for (;;) {
    q = points[i + 1]!
    const seg = Math.hypot(q[0] - cur[0], q[1] - cur[1])
    if (seg >= rest || i + 1 >= b) {
      const f = seg > 0 ? Math.min(1, rest / seg) : 1
      return [cur[0] + (q[0] - cur[0]) * f, cur[1] + (q[1] - cur[1]) * f]
    }
    rest -= seg
    cur = q
    i++
  }
}

async function diagnose(split: 'train' | 'holdout', key: string): Promise<Rec> {
  const { setupKey } = parseChainEpisodeKey(key)
  const kind = parseCourseKey(setupKey).kind
  const { chain } = chainOfEpisode(key)
  const course = buildSetupCourse(setupKey)
  const polys = course.boxes.map((b) => rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1]))
  const pts = chain.points
  const ends = chain.legEnds && chain.legEnds.length ? chain.legEnds : [pts.length - 1]
  // static leg kinds: reversal = the leg turns back against the previous leg (leg 0: against the start heading)
  const legDir = (k: number): V2 => {
    const a = k === 0 ? 0 : ends[k - 1]!
    const b = ends[k]!
    const dx = pts[b]![0] - pts[a]![0], dz = pts[b]![1] - pts[a]![1]
    const n = Math.hypot(dx, dz) || 1
    return [dx / n, dz / n]
  }
  const yaw0 = ((course.startYawDeg ?? 0) * Math.PI) / 180
  const startFwd: V2 = [-Math.sin(yaw0), -Math.cos(yaw0)]
  const dirs = ends.map((_, k) => legDir(k))
  const isRev = ends.map((_, k) => (k === 0 ? dirs[0]![0] * startFwd[0] + dirs[0]![1] * startFwd[1] < 0 : dirs[k]![0] * dirs[k - 1]![0] + dirs[k]![1] * dirs[k - 1]![1] < 0))
  const tracker = new LegProgress(pts, chain.legEnds, chain.offM)
  const frames: Array<{ t: number; x: number; z: number; yaw: number; vf: number; spd: number; gap: number; leg: number; vx: number; vz: number }> = []
  let legStartT = 0
  let lastLeg = 0
  const m = await runPolicyEpisode(genome, key, {
    noise: NOISE,
    onFrame: (x, z, t, e) => {
      tracker.update(x, z)
      if (tracker.leg !== lastLeg) { lastLeg = tracker.leg; legStartT = t }
      const hull = rectPoly(x, z, e!.yaw, CAR_SIZE[0], CAR_SIZE[1])
      let gap = Infinity
      for (const p of polys) { if (Math.hypot(p[0]![0] - x, p[0]![1] - z) < 60) gap = Math.min(gap, polyGap(hull, p)) }
      frames.push({ t, x, z, yaw: e!.yaw, vf: e!.vf, spd: Math.hypot(e!.vx, e!.vz), gap, leg: tracker.leg, vx: e!.vx, vz: e!.vz })
    },
  })
  const last = frames[frames.length - 1]!
  const win = frames.filter((f) => f.t > last.t - WIN_S)
  const win3 = frames.filter((f) => f.t > last.t - 3)
  const dx = Math.sin(last.yaw), dz = Math.cos(last.yaw)
  let fwd = Infinity, back = Infinity
  for (const p of polys) {
    fwd = Math.min(fwd, rayBox(last.x, last.z, dx, dz, p))
    back = Math.min(back, rayBox(last.x, last.z, -dx, -dz, p))
  }
  const cone = (f: { x: number; z: number; yaw: number }) => {
    let r = Infinity
    for (const da of [-20, -10, 0, 10, 20]) {
      const ang = f.yaw + (da * Math.PI) / 180
      for (const p of polys) r = Math.min(r, rayBox(f.x, f.z, Math.sin(ang), Math.cos(ang), p))
    }
    return r
  }
  const at = (dt: number) => frames[Math.max(0, frames.length - 1 - Math.round(dt / 0.0166667))]!
  let nearest: V2 = [last.x, last.z], nd = Infinity
  for (const p of polys) for (let i = 0; i < p.length; i++) {
    const a = p[i]!, b = p[(i + 1) % p.length]!
    const ex = b[0] - a[0], ez = b[1] - a[1]
    const u = Math.max(0, Math.min(1, ((last.x - a[0]) * ex + (last.z - a[1]) * ez) / (ex * ex + ez * ez || 1)))
    const q: V2 = [a[0] + u * ex, a[1] + u * ez]
    const d = Math.hypot(q[0] - last.x, q[1] - last.z)
    if (d < nd) { nd = d; nearest = q }
  }
  let contact = (Math.atan2(nearest[0] - last.x, nearest[1] - last.z) - last.yaw) * 180 / Math.PI
  contact = ((contact + 540) % 360) - 180
  let slip = (Math.atan2(last.vx, last.vz) - last.yaw) * 180 / Math.PI
  slip = ((slip + 540) % 360) - 180
  const li = Math.min(tracker.leg, ends.length - 1)
  const a = li === 0 ? 0 : ends[li - 1]!
  const aim = pointAhead(pts, a, ends[li]!, last.x, last.z, LOOKAHEAD)
  const car: V2 = [last.x, last.z]
  const blocked = (margin: number, ps: V2[][]) => ps.some((p) => segNearPoly(car, aim, p, margin) || inside(aim, p))
  // bearing error of the commanded direction vs the heading (sign aware: reversal legs want the car to point away)
  const want = Math.atan2(aim[0] - last.x, aim[1] - last.z)
  let err = ((want - last.yaw) * 180) / Math.PI
  err = ((err + 540) % 360) - 180
  return {
    split,
    kind,
    key,
    outcome: m.outcome,
    progress: m.progress,
    length: polylineLength(pts),
    frac: m.progress / polylineLength(pts),
    timeS: m.timeS,
    legCount: ends.length,
    legAtEnd: li,
    legIsReverse: isRev[li]!,
    chainHasReverse: isRev.some(Boolean),
    speedEnd: last.spd,
    speedMaxLast3s: Math.max(...win3.map((f) => f.spd)),
    gapEnd: last.gap,
    gapMinLast1s: Math.min(...win.map((f) => f.gap)),
    fwdRayEnd: fwd,
    backRayEnd: back,
    aimBlocked: blocked(0, polys),
    aimBlockedMargin: blocked(2, polys),
    bearingErrDeg: err,
    secondsSinceLegStart: last.t - legStartT,
    meanSpeed: m.meanSpeed,
    chainClear: chainClearance(course.boxes, pts),
    minSpeedAfter3s: Math.min(...frames.filter((f) => f.t > 3 && f.t < last.t - 0.5).map((f) => f.spd), Infinity),
    contactAngleDeg: contact,
    slipDeg: slip,
    speed1s: at(1).spd,
    cone1s: cone(at(1)),
    speed05s: at(0.5).spd,
    cone05s: cone(at(0.5)),
    minGapEarlier: Math.min(...frames.filter((f) => f.t <= last.t - 1).map((f) => f.gap), Infinity),
  }
}

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : 'inf')
const median = (v: number[]) => (v.length ? [...v].sort((p, q) => p - q)[Math.floor(v.length / 2)]! : NaN)
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : '-')

async function main() {
  const recs: Rec[] = []
  const t0 = Date.now()
  for (const split of ['train', 'holdout'] as const) {
    const groups = split === 'train' ? trainV3Episodes(num('train-per-kind', 8), kinds) : holdoutV3Episodes(num('holdout-per-kind', 6), kinds)
    for (const g of groups) for (const k of g.keys) recs.push(await diagnose(split, k))
    console.error(`${split} done ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  }
  if (arg('out')) fs.writeFileSync(arg('out')!, JSON.stringify(recs))
  const outcomes: EpisodeOutcome[] = ['finish', 'crash', 'offcourse', 'stall', 'timeout', 'flip']
  for (const kind of kinds) {
    for (const split of ['train', 'holdout'] as const) {
      const rs = recs.filter((r) => r.kind === kind && r.split === split)
      if (!rs.length) continue
      const fails = rs.filter((r) => r.outcome !== 'finish')
      console.log(`\n## ${kind} ${split}: ${rs.length} chains, finished ${rs.length - fails.length} (${pct(rs.length - fails.length, rs.length)}) | ` + outcomes.map((o) => `${o} ${rs.filter((r) => r.outcome === o).length}`).join(' '))
      const withRev = rs.filter((r) => r.chainHasReverse)
      const noRev = rs.filter((r) => !r.chainHasReverse)
      console.log(`   chains with a reversal leg: ${withRev.length} (finished ${withRev.filter((r) => r.outcome === 'finish').length}), without: ${noRev.length} (finished ${noRev.filter((r) => r.outcome === 'finish').length})`)
      if (!fails.length) continue
      const fr = fails.filter((r) => r.legIsReverse).length
      console.log(`   failures: ${fails.length}; on a reversal leg ${fr}, on a forward leg ${fails.length - fr}; leg index at failure: ${[...new Set(fails.map((r) => r.legAtEnd))].sort().map((l) => `${l}:${fails.filter((r) => r.legAtEnd === l).length}`).join(' ')} (of ${fails[0]!.legCount}+ legs)`)
      console.log(`   progress fraction at failure: median ${median(fails.map((r) => r.frac)).toFixed(2)}, <0.25: ${fails.filter((r) => r.frac < 0.25).length}, 0.25-0.75: ${fails.filter((r) => r.frac >= 0.25 && r.frac < 0.75).length}, >=0.75: ${fails.filter((r) => r.frac >= 0.75).length}`)
      console.log(`   speed at end (m/s): median ${f1(median(fails.map((r) => r.speedEnd)))}, max-last-3s median ${f1(median(fails.map((r) => r.speedMaxLast3s)))}; hull gap at end (m) median ${f1(median(fails.map((r) => r.gapEnd)))}, min last 1 s median ${f1(median(fails.map((r) => r.gapMinLast1s)))}; fwd ray median ${f1(median(fails.map((r) => r.fwdRayEnd)))}, back ray median ${f1(median(fails.map((r) => r.backRayEnd)))}`)
      console.log(`   aim line through a box: raw ${fails.filter((r) => r.aimBlocked).length}/${fails.length}, with 2 m margin ${fails.filter((r) => r.aimBlockedMargin).length}/${fails.length}; |bearing error| to aim median ${f1(median(fails.map((r) => Math.abs(r.bearingErrDeg))))} deg`)
      for (const o of outcomes.filter((o) => o !== 'finish')) {
        const os = fails.filter((r) => r.outcome === o)
        if (!os.length) continue
        console.log(`   - ${o} x${os.length}: speed ${f1(median(os.map((r) => r.speedEnd)))} m/s, hull gap ${f1(median(os.map((r) => r.gapEnd)))} m, fwd ray ${f1(median(os.map((r) => r.fwdRayEnd)))} m, aim-blocked(2 m) ${os.filter((r) => r.aimBlockedMargin).length}, reverse-leg ${os.filter((r) => r.legIsReverse).length}, t ${f1(median(os.map((r) => r.timeS)))} s, frac ${median(os.map((r) => r.frac)).toFixed(2)}`)
      }
      const ca = fails.map((r) => Math.abs(r.contactAngleDeg))
      console.log(`   contact side (|angle| from car centre to nearest box point): front<35 deg ${ca.filter((a) => a < 35).length}, side 35-145 ${ca.filter((a) => a >= 35 && a <= 145).length}, rear>145 ${ca.filter((a) => a > 145).length}; slip angle median ${f1(median(fails.map((r) => Math.abs(r.slipDeg))))} deg`)
      console.log(`   1 s before the end: speed ${f1(median(fails.map((r) => r.speed1s)))} m/s, cone ray (+-20 deg) median ${f1(median(fails.map((r) => r.cone1s)))} m; 0.5 s before: speed ${f1(median(fails.map((r) => r.speed05s)))} m/s, cone ${f1(median(fails.map((r) => r.cone05s)))} m (needs 0 braking distance at 27 m/s ~ 0.5 s => ~14 m ahead)`)
      console.log(`   mean speed of the FAILED episodes ${f1(median(fails.map((r) => r.meanSpeed)))} vs FINISHED ${f1(median(rs.filter((r) => r.outcome === 'finish').map((r) => r.meanSpeed)))} m/s; min hull gap before the last second: failed median ${f1(median(fails.map((r) => r.minGapEarlier)))} m, finished median ${f1(median(rs.filter((r) => r.outcome === 'finish').map((r) => r.minGapEarlier)))} m`)
      const fin = rs.filter((r) => r.outcome === 'finish')
      console.log(`   chain clearance (min free space beside the commanded line, m): failed median ${f1(median(fails.map((r) => r.chainClear)))}, finished median ${f1(median(fin.map((r) => r.chainClear)))}; lowest speed after 3 s: failed median ${f1(median(fails.map((r) => r.minSpeedAfter3s)))}, finished median ${f1(median(fin.map((r) => r.minSpeedAfter3s)))} m/s`)
      if (argv.includes('--list')) for (const r of fails) console.log(`     ${r.key} ${r.outcome} leg ${r.legAtEnd}/${r.legCount}${r.legIsReverse ? 'R' : 'F'} frac ${r.frac.toFixed(2)} t ${f1(r.timeS)} v ${f1(r.speedEnd)} gap ${f1(r.gapEnd)} fwd ${f1(r.fwdRayEnd)} back ${f1(r.backRayEnd)} aimBlk ${r.aimBlocked ? 1 : 0}/${r.aimBlockedMargin ? 1 : 0} err ${f1(r.bearingErrDeg)} legT ${f1(r.secondsSinceLegStart)} contact ${f1(r.contactAngleDeg)} slip ${f1(r.slipDeg)} cone1s ${f1(r.cone1s)} cone.5s ${f1(r.cone05s)}`)
    }
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
