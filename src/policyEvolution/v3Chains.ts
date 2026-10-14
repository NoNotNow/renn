import { createRng, type Rng } from '@/avEvolution/core/rng'
import type { V2 } from '@/avEvolution/eval/geometry'
import { buildSetupCourse, deadendWorld, FREE_HALF, parseCourseKey, rslalomWorld, type Course } from './courses'
import type { Chain } from './chains'

/**
 * v3 direction chains (spec-command-chains.md, section v3). Chains here are sequences of LEGS (straight pieces; `legEnds` = point index where each leg ends);
 * a leg may point back the way the car came from. The reward does not prescribe forward or reverse: a short back leg is cheapest to reverse, a long one may be
 * turned. Three setup kinds:
 *  - `free`: a big closed empty arena, seeded chains of 6-12 legs mixing forward legs, reversals (back 5-20 m, then on), lateral targets (60-120 deg off the
 *    travelling direction) and stop-and-go (3-6 m legs); 4 chains per setup, the 2nd one starts with a reversal.
 *  - `bay`: dead-end bays too narrow to turn in: drive in, back out, then on to one of three exits.
 *  - `corridor`: straight closed corridors too narrow to turn in: forward / back / forward ..., or back first.
 * Deterministic from the setup key. No dependency on the v2 grid planner (the geometry is simple enough to lay the chains by hand).
 */

export const FREE_CHAINS_PER_SETUP = 4
/** free-track chains stay this far inside the arena walls */
export const FREE_MARGIN = 14
/** offcourse tolerance per kind: a manoeuvre on the empty free track swings wide, a bay / corridor is narrow (the walls end the episode first) */
export const OFF_FREE_M = 20
export const OFF_REVERSAL_M = 8

const hash = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  return h
}
const rad = (d: number) => (d * Math.PI) / 180
const uni = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng.next()
const dirVec = (a: number): V2 => [-Math.sin(a), -Math.cos(a)]

function toChain(points: V2[], legEnds: number[], endIndex: number, offM: number): Chain {
  let length = 0
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1])
  return { points, length, endIndex, legEnds, offM }
}

/** Heading of the car at the start (radians, 0 = -Z, positive = left). */
const startHeading = (course: Course) => rad(course.startYawDeg ?? 0)

// --- free ---------------------------------------------------------------------------------------------------------------------------

type Pattern = 'forward' | 'reversal' | 'lateral' | 'stop'

/**
 * One free-track chain. `backFirst`: the first pattern is a reversal (the car must reverse before it can go on). Patterns (the direction `d` is the
 * previous leg's direction, i.e. the way the car travelled):
 *  forward  one leg 15-35 m, d += +-40 deg
 *  reversal a back leg 5-20 m along -d (+-30 deg), then a forward leg 15-35 m along d (+-25 deg)
 *  lateral  one leg 12-25 m, d += +-(60..120) deg
 *  stop     three short legs of 3-6 m, d += +-35 deg each (stop-and-go: the aim is always very close)
 * A leg that would leave the arena is re-drawn (up to 10 times), then pointed at the middle of the arena.
 */
export function freeChain(start: V2, heading: number, seedKey: string, backFirst = false): Chain {
  const rng = createRng(hash(seedKey))
  const lim = FREE_HALF - FREE_MARGIN
  const inside = (p: V2) => Math.abs(p[0]) <= lim && Math.abs(p[1]) <= lim
  const points: V2[] = [start]
  const legEnds: number[] = []
  let dir = heading + rad(uni(rng, -35, 35))
  const target = 6 + Math.floor(rng.next() * 7)
  const addLeg = (angle: number, len: number): boolean => {
    const cur = points[points.length - 1]!
    const v = dirVec(angle)
    const p: V2 = [cur[0] + v[0] * len, cur[1] + v[1] * len]
    if (!inside(p)) return false
    points.push(p)
    legEnds.push(points.length - 1)
    return true
  }
  const toMiddle = (): number => {
    const cur = points[points.length - 1]!
    return Math.atan2(-(0 - cur[0]), -(0 - cur[1]))
  }
  let first = true
  while (legEnds.length < target) {
    const pat: Pattern = first && backFirst ? 'reversal' : first ? 'forward' : (['forward', 'forward', 'forward', 'reversal', 'reversal', 'lateral', 'lateral', 'stop'] as const)[Math.floor(rng.next() * 8)]!
    first = false
    let ok = false
    for (let attempt = 0; attempt < 10 && !ok; attempt++) {
      const mark = points.length
      const markLegs = legEnds.length
      let nd = dir
      if (pat === 'forward') {
        nd = dir + rad(uni(rng, -40, 40))
        ok = addLeg(nd, uni(rng, 15, 35))
      } else if (pat === 'reversal') {
        ok = addLeg(dir + Math.PI + rad(uni(rng, -30, 30)), uni(rng, 5, 20))
        nd = dir + rad(uni(rng, -25, 25))
        ok = ok && addLeg(nd, uni(rng, 15, 35))
      } else if (pat === 'lateral') {
        nd = dir + (rng.next() < 0.5 ? -1 : 1) * rad(uni(rng, 60, 120))
        ok = addLeg(nd, uni(rng, 12, 25))
      } else {
        ok = true
        for (let k = 0; k < 3 && ok; k++) {
          nd += rad(uni(rng, -35, 35))
          ok = addLeg(nd, uni(rng, 3, 6))
        }
      }
      if (ok) dir = nd
      else {
        points.length = mark
        legEnds.length = markLegs
      }
    }
    if (!ok) {
      // pointed at the middle of the arena
      const a = toMiddle()
      if (addLeg(a, uni(rng, 15, 30))) dir = a
      else break
    }
  }
  return toChain(points, legEnds, 0, OFF_FREE_M)
}

function freeChains(setupKey: string, course: Course): Chain[] {
  const start: V2 = course.startAt ?? [0, 0]
  const heading = startHeading(course)
  return Array.from({ length: FREE_CHAINS_PER_SETUP }, (_, i) => ({ ...freeChain(start, heading, `${setupKey}/${i}`, i === 1), endIndex: i }))
}

// --- bay ----------------------------------------------------------------------------------------------------------------------------

function bayChains(setupKey: string, course: Course): Chain[] {
  const L = course.layout!
  const bx = L.bx!
  const zf = L.zFront!
  const tip = zf - L.bd! + 10
  const retreat = zf + 12
  const start: V2 = course.startAt ?? [0, 0]
  const rng = createRng(hash(setupKey))
  const exits: V2[] = [
    [-uni(rng, 20, 30), uni(rng, -26, -6)],
    [uni(rng, 20, 30), uni(rng, -26, -6)],
    [uni(rng, -8, 8), uni(rng, 8, 16)],
  ]
  return exits.map((e, i) => {
    // in: gentle S towards the bay axis, then straight in; out: straight back; on: to the exit
    const pts: V2[] = [start, [(start[0] + bx) / 2, zf + 40], [bx, zf + 18], [bx, tip], [bx, retreat], e]
    return toChain(pts, [3, 4, 5], i, OFF_REVERSAL_M)
  })
}

// --- corridor -----------------------------------------------------------------------------------------------------------------------

function corridorChains(setupKey: string, course: Course): Chain[] {
  const L = course.layout!
  const rear = L.rear!
  const ahead = L.ahead!
  const rng = createRng(hash(setupKey))
  const start: V2 = course.startAt ?? [0, 0]
  const far = -(ahead - 12)
  // A: forward to the dead end area, back out (reverse), forward again to the far end
  const lf = uni(rng, 30, ahead - 30)
  const lb = uni(rng, 20, Math.min(40, lf + rear - 14))
  const a: V2[] = [start, [0, -lf], [0, -lf + lb], [0, far]]
  // B: back first (reverse towards the rear wall), then forward through
  const back = uni(rng, 8, rear - 14)
  const b: V2[] = [start, [0, back], [0, far]]
  // C: stop-and-go: forward 8-12, back 8-12, forward 25-40, back 12-20, forward to the far end
  const f1 = uni(rng, 8, 12)
  const b1 = uni(rng, 8, 12)
  const f2 = uni(rng, 25, 40)
  const b2 = uni(rng, 12, 20)
  const c: V2[] = [start, [0, -f1], [0, -f1 + b1], [0, -f1 + b1 - f2], [0, -f1 + b1 - f2 + b2], [0, far]]
  return [toChain(a, [1, 2, 3], 0, OFF_REVERSAL_M), toChain(b, [1, 2], 1, OFF_REVERSAL_M), toChain(c, [1, 2, 3, 4, 5], 2, OFF_REVERSAL_M)]
}

// --- rslalom (widen-freeze: full-length reverse chains with steering) ---------------------------------------------------------------

/**
 * Chains of `rslalom` (v3): the base weave through the pillar gaps plus two variants — all legs point toward the far
 * end, and the car starts FACING THE REAR WALL, so every chain is driven in reverse. B adds a short stop-and-go warmup
 * (two 4 m legs in reverse) before the weave; C inserts a mid-chain pull-forward correction (drive 10 m back toward
 * the start, then continue) — the forward-reverse-forward transitions a missed gate costs.
 */
function rslalomChains(setupKey: string): Chain[] {
  const { seed, variant } = parseCourseKey(setupKey)
  const world = rslalomWorld(seed, variant)
  const start: V2 = buildSetupCourse(setupKey).startAt ?? [0, 0]
  const ahead = world.layout.ahead!
  const end: V2 = [world.weave.length ? world.weave[world.weave.length - 1]![0] : 0, -(ahead - 10)]
  const legsOf = (pts: V2[]): number[] => pts.slice(1).map((_, i) => i + 1)
  // A: the full weave
  const a: V2[] = [start, ...world.weave, end]
  // B: stop-and-go warmup (two 4 m legs in reverse) before the weave
  const b: V2[] = [start, [start[0], start[1] - 4], [start[0], start[1] - 8], ...world.weave, end]
  // C: pull-forward correction at the middle pillar — a there-and-back SPIKE along the gap centre (10 m back toward
  // the start, then through the same gap again): every segment is a known-clear line (the spike runs parallel to the
  // walls at gap/2 >= 3.75 m off the pillar's inner edge; a diagonal pull would clip the previous pillar's corner)
  const mid = Math.max(1, Math.floor(world.weave.length / 2))
  const m = world.weave[mid - 1]!
  const pull: V2 = [m[0], m[1] + 10]
  const c: V2[] = [start, ...world.weave.slice(0, mid), pull, ...world.weave.slice(mid - 1), end]
  return [
    toChain(a, legsOf(a), 0, OFF_REVERSAL_M),
    toChain(b, legsOf(b), 1, OFF_REVERSAL_M),
    toChain(c, legsOf(c), 2, OFF_REVERSAL_M),
  ]
}

// --- deadend (widen-freeze: two-bay dead-end hall, more variety than bay) ------------------------------------------------------------

/**
 * Chains of `deadend` (v3): pull into a bay, reverse out, then exit (A / B, one per bay) — or cross the hall and do
 * it AGAIN in the other bay (C: two full reversals with a forward arc between them). Same leg shape as the bay chains
 * (in / back-out / on), so everything the nets learned on `bay` transfers.
 */
function deadendChains(setupKey: string): Chain[] {
  const { seed, variant } = parseCourseKey(setupKey)
  const world = deadendWorld(seed, variant)
  const start: V2 = buildSetupCourse(setupKey).startAt ?? [0, 0]
  const [bA, bB] = world.bays
  const intoBay = (bay: typeof bA): V2[] => [
    [start[0] + (bay.ax - start[0]) / 2, bay.mouth + 6],
    [bay.ax, bay.mouth],
    [bay.ax, bay.tip],
    [bay.ax, bay.retreat],
  ]
  // A: into the LEFT bay, back out, exit left
  const a: V2[] = [start, ...intoBay(bA), world.exits.left]
  // B: into the RIGHT bay, back out, exit right
  const b: V2[] = [start, ...intoBay(bB), world.exits.right]
  // C: into A, back out, arc across the hall, into B, back out, exit at the back
  //   points: 0 start | 1-4 bay A (tip at 3, retreat at 4) | 5 arc mid | 6-9 bay B (tip at 8, retreat at 9) | 10 exit
  const c: V2[] = [start, ...intoBay(bA), [(bA.ax + bB.ax) / 2, 6], ...intoBay(bB), world.exits.back]
  return [
    toChain(a, [3, 4, 5], 0, OFF_REVERSAL_M),
    toChain(b, [3, 4, 5], 1, OFF_REVERSAL_M),
    toChain(c, [3, 4, 8, 9, 10], 2, OFF_REVERSAL_M),
  ]
}

/** Chains of a v3 setup kind (`free`, `bay`, `corridor`, `rslalom`, `deadend`). */
export function generateV3Chains(setupKey: string): Chain[] {
  const { kind } = parseCourseKey(setupKey)
  const course = buildSetupCourse(setupKey)
  if (kind === 'free') return freeChains(setupKey, course)
  if (kind === 'bay') return bayChains(setupKey, course)
  if (kind === 'corridor') return corridorChains(setupKey, course)
  if (kind === 'rslalom') return rslalomChains(setupKey)
  if (kind === 'deadend') return deadendChains(setupKey)
  throw new Error(`generateV3Chains: ${kind} is not a v3 setup kind`)
}
