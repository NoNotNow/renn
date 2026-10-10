import { createRng, type Rng } from '@/avEvolution/core/rng'
import type { V2 } from '@/avEvolution/eval/geometry'
import { buildSetupCourse, FREE_HALF, parseCourseKey, type Course } from './courses'
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

/** Chains of a v3 setup kind (`free`, `bay`, `corridor`). */
export function generateV3Chains(setupKey: string): Chain[] {
  const { kind } = parseCourseKey(setupKey)
  const course = buildSetupCourse(setupKey)
  if (kind === 'free') return freeChains(setupKey, course)
  if (kind === 'bay') return bayChains(setupKey, course)
  if (kind === 'corridor') return corridorChains(setupKey, course)
  throw new Error(`generateV3Chains: ${kind} is not a v3 setup kind`)
}
