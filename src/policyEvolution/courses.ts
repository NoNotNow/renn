import { createRng, type Rng } from '@/avEvolution/core/rng'
import { pointPolyGap, polyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import { cellCentre, generateMaze } from '@/avEvolution/maze/mazeGen'

/**
 * Seeded driving courses for the policy evolution. The car starts at the origin facing -Z; the route runs along -Z.
 *  - `field`: a closed 38 m wide track (side walls, back and end wall) with scattered boxes whose density grows with distance and a goal
 *    chain near the middle. The track is closed on purpose: an open field lets the car drive around the whole obstacle field.
 *  - `slalom`: a corridor that narrows with distance, staggered pillars from alternating sides, goals in the gaps.
 *  - `maze`: a seeded 6x6 maze; the car starts in a south-row cell, the goal chain follows the shortest route cell by cell to the exit gate
 *    on the north side (the policy has no map: the goal vector is its only hint which way the route turns).
 *  - `grid` (v3 setup kind, chains only): a walled 5-lane serpentine whose divider tips are staggered so a U-turn at the end of every lane
 *    is the only way forward; see `gridCourse`.
 *  - `crux` (v3 setup kind, chains only): a TINY world holding exactly ONE crux of the v3nose failure analysis (a few hand-placed
 *    wall segments, chain length ~30-70 m); see `cruxCourse`. The class of a seed is `(seed - 1) % 2` (NC1 fast corner, NC2
 *    start swing) and the embodiment within the class alternates with the seed, so the standard seed bands cover every class
 *    AND every embodiment evenly.
 *  - `rslalom` / `deadend` / `gates` / `dense` (v3 setup kinds, widen-freeze 2026-10-13): see `rslalomCourse`, `deadendCourse`,
 *    `gatesCourse`, `denseCourse` — two reversal-heavy kinds (full-length reverse slalom; a two-bay dead-end hall) and two
 *    forward obstacle-avoidance kinds (tight alternating gates; a dense jittered obstacle lattice). Their geometry is re-seeded
 *    per start VARIANT (`variantRng`), so the per-generation variant rotation re-jitters the obstacle world itself.
 *  - `blockade` / `blocks` (v3 setup kinds, obstacle-fluency 2026-10-14): see `blockadeCourse`, `blocksCourse` — two DETOUR kinds:
 *    bounded plazas whose TARGET sits behind obstacle(s) that the direct start -> target line passes THROUGH, so the target
 *    vector points at the obstacle and forward progress demands a committed swing around its end. `blockade`: transverse wall
 *    PAIRS crossing the line, the seeded opening MID-PLAZA (2026-10-15 T1 course change: the swing must stay in the learnable
 *    band, ~14-21 m, not the side walls' 34-42 m), alternating sides; `blocks`: big jittered blocks with one ON the line.
 */
export type CourseKind = 'field' | 'slalom' | 'maze' | 'crowd' | 'free' | 'bay' | 'corridor' | 'grid' | 'crux' | 'rslalom' | 'deadend' | 'gates' | 'dense' | 'blockade' | 'blocks' | 'pocket' | 'tee' | 'hall'

/** The v1 kinds (default sets of the v1 tools). `crowd` is a v2 chain setup kind, see CHAIN_KINDS. */
export const COURSE_KINDS: readonly CourseKind[] = ['field', 'slalom', 'maze']
/** Setup kinds of the v2 command-chain training (src/policyEvolution/chains.ts). */
export const CHAIN_KINDS: readonly CourseKind[] = ['field', 'slalom', 'maze', 'crowd']
/** v3 setup kinds: `free` (big closed arena, direction chains with reversals), `bay` (dead-end bays), `corridor` (too narrow to U-turn); see spec-command-chains.md, section v3. */
export const REVERSAL_KINDS: readonly CourseKind[] = ['bay', 'corridor', 'rslalom', 'deadend']
export const V3_NEW_KINDS: readonly CourseKind[] = ['free', ...REVERSAL_KINDS]
/**
 * The kturn maneuver kinds (Rangieren plan, 2026-10-19): small tight worlds whose chains are MULTI-MOVE turning
 * sequences (1-/3-/5-Zug with reverse phases) laid by the maneuver search (kturnChains.ts) — the plan is the
 * CHAIN, the net learns the execution. Trainable + informational in every eval (like blocks), OUT of the ship
 * band (conscious decision 2026-10-19, pinned in wfCandidateWorlds.test.ts).
 */
export const KTURN_KINDS: readonly CourseKind[] = ['pocket', 'tee', 'hall']
export const isKturnKind = (k: CourseKind) => KTURN_KINDS.includes(k)
/** all v3 kinds in report order: the new free-track / reversal kinds, the v2 obstacle kinds, the widen-freeze forward-avoidance kinds, the obstacle-fluency detour kinds, the grid serpentine, the crux worlds and the kturn maneuver kinds */
export const V3_KINDS: readonly CourseKind[] = [...V3_NEW_KINDS, ...CHAIN_KINDS, 'gates', 'dense', 'blockade', 'blocks', 'grid', 'crux', ...KTURN_KINDS]
export const isV3NewKind = (k: CourseKind) => V3_NEW_KINDS.includes(k)

/**
 * v3 adversarial curriculum (failure-mined, T4): TRAIN-only maze / grid setups that exercise exactly the geometries the shipped policy
 * fails on. The band is the SEED: every maze / grid seed >= ADV_SEED builds adversarial geometry, so the per-generation start-variant
 * rotation of run-islands (`withVariant(key, g + 1)`, which rewrites the variant) keeps the adversarial task. The ENUMERATED keys
 * (adversarialSetupKeys, chains.ts) additionally carry variant ADV_VARIANT: the standard train band is variant 0 and the holdout band
 * variant 1, so an enumerated adversarial key can never appear in either band for ANY perKind or seed (the variant suffix alone
 * distinguishes the strings). ADV_SEED also sits far above the seed range the standard bands can ever scan: acceptedSetupKeys counts
 * seeds up from firstSeed (1 / 1001) inside a hard guard of firstSeed + 20 * perKind + 50 (<= 251 / 1251 for the perKind <= 10 every
 * caller uses), and the dialog worlds use seeds 2001-2010 - so no standard course ever builds with an adversarial seed either.
 * Collision-free: variant 2 vs variant 0 / 1 (enumerated keys), seed >= 4001 vs scanned seed ranges (course geometry).
 */
export const ADV_SEED = 4001
/** variant of the enumerated adversarial keys: 2 = canonical start (no jitterStart), see adversarialStyle */
export const ADV_VARIANT = 2
/** the adversarial kinds: only maze and grid have failure-mined setups today */
export const ADVERSARIAL_KINDS: readonly CourseKind[] = ['maze', 'grid']
/**
 * Failure class of an adversarial setup, fixed by the seed parity (both styles scan their own seeds, so a rejected seed never
 * changes which class the setup exercises):  0 = maze M1 corner-exit chain end / grid G1 tight mid-hairpin,
 * 1 = maze M2 lateral start leg / grid G2 chain end past the last hairpin. undefined = standard course.
 */
export function adversarialStyle(kind: CourseKind, seed: number): 0 | 1 | undefined {
  if (!ADVERSARIAL_KINDS.includes(kind) || seed < ADV_SEED) return undefined
  return ((seed - ADV_SEED) % 2) as 0 | 1
}

export interface CourseBox {
  at: V2
  /** extent across (x) and along (z) the box before yaw */
  size: V2
  yawDeg: number
}

export interface Course {
  key: string
  kind: CourseKind
  seed: number
  boxes: CourseBox[]
  /** goal chain in driving order (the car's start is not included) */
  waypoints: V2[]
  /** route length from the start through the last waypoint (m) */
  length: number
  /** car heading at the start in degrees (0 = -Z, positive turns left); default 0 */
  startYawDeg?: number
  /** car start position; default COURSE_START. Only start variants (key suffix `~n`, n >= 1) move it */
  startAt?: V2
  /** start variant: 0 = canonical start, n >= 1 = seeded random start offset and heading */
  variant: number
  /** field difficulty 0..1 (1 = full density / box size, the default); only `field` reacts to it */
  difficulty: number
  /** v3 kinds (free / bay / corridor): the seeded layout numbers the chain generator needs (see `bayCourse`, `corridorCourse`) */
  layout?: Record<string, number>
}

export const COURSE_LENGTH = 400
export const COURSE_START: V2 = [0, 0]

export const KIND_SALT: Record<CourseKind, number> = { field: 7919, slalom: 104729, maze: 1299709, crowd: 15485863, free: 32452843, bay: 49979687, corridor: 67867967, grid: 86028121, crux: 86028157, rslalom: 314606891, deadend: 357172253, gates: 401948389, dense: 447262247, blockade: 520395019, blocks: 568483669, pocket: 669537217, tee: 680531237, hall: 691827941 }

/**
 * Layout rng of the widen-freeze kinds (`rslalom`, `deadend`, `gates`, `dense`): re-seeded by the start VARIANT, so the
 * per-generation variant rotation of run-islands (`withVariant(key, g + 1)`) re-jitters the OBSTACLE GEOMETRY itself
 * (pillar positions, gate widths, bay layout, lattice draws) — every generation trains on a fresh world of the same
 * family, the exact per-episode variation the new kinds exist for. Variant 0 (canonical) is the plain seed-only stream.
 */
const variantRng = (kind: CourseKind, seed: number, variant: number): Rng => createRng((seed * 2654435761 + KIND_SALT[kind] + variant * 2246822519) >>> 0)

/**
 * `kind:seed` = canonical start; `kind:seed~n` = the same course with the n-th seeded random start pose (offset + heading);
 * `kind:seed~n@d` additionally sets the field difficulty d (0..1, curriculum; omitted = 1 = full).
 */
export function courseKey(kind: CourseKind, seed: number, variant = 0, difficulty = 1): string {
  return `${kind}:${seed}${variant > 0 ? `~${variant}` : ''}${difficulty < 1 ? `@${difficulty}` : ''}`
}

export function withVariant(key: string, variant: number): string {
  const { kind, seed, difficulty } = parseCourseKey(key)
  return courseKey(kind, seed, variant, difficulty)
}

export function withDifficulty(key: string, difficulty: number): string {
  const { kind, seed, variant } = parseCourseKey(key)
  return courseKey(kind, seed, variant, difficulty)
}

export function parseCourseKey(key: string): { kind: CourseKind; seed: number; variant: number; difficulty: number } {
  const [rest, d] = key.split('@')
  const [head, v] = rest!.split('~')
  const [kind, s] = head!.split(':')
  const seed = Number(s)
  const variant = v === undefined ? 0 : Number(v)
  const difficulty = d === undefined ? 1 : Number(d)
  if (!ALL_KINDS.includes(kind as CourseKind) || !Number.isInteger(seed) || !Number.isInteger(variant) || variant < 0 || !(difficulty >= 0 && difficulty <= 1)) throw new Error(`bad course key: ${key}`)
  return { kind: kind as CourseKind, seed, variant, difficulty }
}

const ALL_KINDS: readonly CourseKind[] = V3_KINDS

const range = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng.next()

/** half-width of the field track: side walls stand at +-FIELD_HALF_WIDTH (the field is a closed track, it cannot be bypassed) */
export const FIELD_HALF_WIDTH = 19

function fieldCourse(rng: Rng, difficulty: number): Pick<Course, 'boxes' | 'waypoints'> {
  // curriculum: difficulty 1 = the full course (identical to before), 0 = an empty track (walls and goals only), in between fewer and smaller boxes
  const density = difficulty
  const maxSize = 4 + 4 * difficulty
  const waypoints: V2[] = []
  let x = 0
  for (let z = -40; z >= -COURSE_LENGTH; z -= 40) {
    x = Math.max(-8, Math.min(8, x + range(rng, -8, 8)))
    waypoints.push([x, z])
  }
  const boxes: CourseBox[] = []
  // closed track: side walls, a back wall behind the start and an end wall behind the finish
  for (let z = 20; z > -COURSE_LENGTH - 40; z -= 40) for (const side of [-1, 1]) boxes.push({ at: [side * FIELD_HALF_WIDTH, z - 20], size: [2, 40], yawDeg: 0 })
  boxes.push({ at: [0, 24], size: [2 * FIELD_HALF_WIDTH + 2, 2], yawDeg: 0 })
  boxes.push({ at: [0, -COURSE_LENGTH - 24], size: [2 * FIELD_HALF_WIDTH + 2, 2], yawDeg: 0 })
  for (let z0 = -30; z0 > -COURSE_LENGTH - 20; z0 -= 20) {
    const t = Math.min(1, -z0 / COURSE_LENGTH)
    const count = Math.round((2.5 + 6.5 * t) * density)
    for (let i = 0; i < count; i++) {
      const box: CourseBox = {
        at: [range(rng, -(FIELD_HALF_WIDTH - 4), FIELD_HALF_WIDTH - 4), z0 - rng.next() * 20],
        size: [range(rng, 2, maxSize), range(rng, 2, maxSize)],
        yawDeg: range(rng, 0, 180),
      }
      const poly = rectPoly(box.at[0], box.at[1], (box.yawDeg * Math.PI) / 180, box.size[0], box.size[1])
      // keep the start and every goal itself clear (the way between goals is ground the car has to read)
      if (pointPolyGap(COURSE_START[0], COURSE_START[1], poly) < 14) continue
      if (waypoints.some((w) => pointPolyGap(w[0], w[1], poly) < 6)) continue
      boxes.push(box)
    }
  }
  return { boxes, waypoints }
}

function slalomCourse(rng: Rng): Pick<Course, 'boxes' | 'waypoints'> {
  const widthAt = (z: number) => 28 - 12 * Math.min(1, -z / COURSE_LENGTH)
  const boxes: CourseBox[] = []
  const waypoints: V2[] = []
  for (let z = 20; z > -COURSE_LENGTH - 20; z -= 40) {
    const w = widthAt(z)
    for (const side of [-1, 1]) boxes.push({ at: [side * (w / 2 + 1), z - 20], size: [2, 40], yawDeg: 0 })
  }
  let side = rng.next() < 0.5 ? -1 : 1
  let z = -45
  while (z > -COURSE_LENGTH) {
    const w = widthAt(z)
    const p = w * range(rng, 0.5, 0.58)
    boxes.push({ at: [side * (w / 2 - p / 2), z], size: [p, 3], yawDeg: 0 })
    waypoints.push([-side * (p / 2), z])
    const next = z - range(rng, 22, 30)
    if (next > -COURSE_LENGTH) waypoints.push([0, (z + next) / 2])
    side = -side
    z = next
  }
  waypoints.push([0, -COURSE_LENGTH])
  return { boxes, waypoints }
}

/** half-width of the crowd track: side walls stand at +-CROWD_HALF_WIDTH (inner face 1 m inside, so ~42 m of drivable width) */
export const CROWD_HALF_WIDTH = 22
const CROWD_SLOT = 4.6
const CROWD_SLOTS = 9

/**
 * `crowd` (v2 setup kind, static only): a closed ~40 m wide track with rows of parked 4 x 8 cars across it. Every row leaves 2 gaps
 * (3-4 empty parking slots wide, 14.4 / 19 m) at random places, aisles between the rows carry a few clutter boxes. The way through is a
 * different sequence of gaps per setup, and several gap sequences exist.
 */
function crowdCourse(rng: Rng): Pick<Course, 'boxes' | 'waypoints'> {
  const hw = CROWD_HALF_WIDTH
  const boxes: CourseBox[] = []
  for (let z = 20; z > -COURSE_LENGTH - 40; z -= 40) for (const side of [-1, 1]) boxes.push({ at: [side * hw, z - 20], size: [2, 40], yawDeg: 0 })
  boxes.push({ at: [0, 24], size: [2 * hw + 2, 2], yawDeg: 0 })
  boxes.push({ at: [0, -COURSE_LENGTH - 24], size: [2 * hw + 2, 2], yawDeg: 0 })
  const rowZ: number[] = []
  for (let z = -50; z > -COURSE_LENGTH + 10; z -= range(rng, 28, 36)) rowZ.push(z)
  for (const z of rowZ) {
    const gap = new Array<boolean>(CROWD_SLOTS).fill(false)
    const runs = 2
    for (let r = 0; r < runs; r++) {
      const len = 3 + Math.floor(rng.next() * 2)
      for (let attempt = 0; attempt < 20; attempt++) {
        const s0 = Math.floor(rng.next() * (CROWD_SLOTS - len + 1))
        let ok = true
        for (let i = Math.max(0, s0 - 1); i <= Math.min(CROWD_SLOTS - 1, s0 + len); i++) if (gap[i]) ok = false
        if (!ok) continue
        for (let i = s0; i < s0 + len; i++) gap[i] = true
        break
      }
    }
    for (let i = 0; i < CROWD_SLOTS; i++) {
      if (gap[i]) continue
      boxes.push({ at: [(i - (CROWD_SLOTS - 1) / 2) * CROWD_SLOT, z + range(rng, -1.5, 1.5)], size: [4, 8], yawDeg: range(rng, -3, 3) })
    }
  }
  // clutter in the aisles (central part only, so it never plugs a row gap)
  const edges = [-20, ...rowZ, -COURSE_LENGTH]
  for (let a = 0; a + 1 < edges.length; a++) {
    const zc = (edges[a]! + edges[a + 1]!) / 2
    if (edges[a]! - edges[a + 1]! < 20) continue
    const count = Math.floor(rng.next() * 4)
    for (let i = 0; i < count; i++) boxes.push({ at: [range(rng, -(hw - 6), hw - 6), zc + range(rng, -4, 4)], size: [range(rng, 1.5, 3), range(rng, 1.5, 3)], yawDeg: range(rng, 0, 180) })
  }
  return { boxes, waypoints: [[0, -COURSE_LENGTH]] }
}

/**
 * v2 `slalom` geometry (chain setups): the same narrowing corridor (44 -> 34 m), but the obstacles are central islands (20-26 % of the width, slightly offset
 * to alternating sides) that can be passed on BOTH sides, so several routes through the corridor exist. v1 `slalomCourse` is untouched.
 */
function slalomIslandsCourse(rng: Rng): Pick<Course, 'boxes' | 'waypoints'> {
  const widthAt = (z: number) => 44 - 10 * Math.min(1, -z / COURSE_LENGTH)
  const boxes: CourseBox[] = []
  const waypoints: V2[] = []
  for (let z = 20; z > -COURSE_LENGTH - 20; z -= 40) {
    const w = widthAt(z)
    for (const side of [-1, 1]) boxes.push({ at: [side * (w / 2 + 1), z - 20], size: [2, 40], yawDeg: 0 })
  }
  let side = rng.next() < 0.5 ? -1 : 1
  for (let z = -45; z > -COURSE_LENGTH; z -= range(rng, 24, 32)) {
    const w = widthAt(z)
    const p = w * range(rng, 0.2, 0.26)
    const c = side * w * range(rng, 0.04, 0.1)
    boxes.push({ at: [c, z], size: [p, 3], yawDeg: 0 })
    waypoints.push([(-side * (w / 2) + c - (side * p) / 2) / 2, z])
    side = -side
  }
  waypoints.push([0, -COURSE_LENGTH])
  return { boxes, waypoints }
}

/** half size of the free arena: walls stand at +-FREE_HALF (inner faces), nothing inside */
export const FREE_HALF = 100

/** `free` (v3 stage A): a big closed empty arena; the car starts in the middle. Chains are seeded direction chains (v3Chains.ts). */
function freeCourse(): Pick<Course, 'boxes' | 'waypoints'> {
  const h = FREE_HALF
  const boxes: CourseBox[] = [
    { at: [0, -(h + 1)], size: [2 * h + 4, 2], yawDeg: 0 },
    { at: [0, h + 1], size: [2 * h + 4, 2], yawDeg: 0 },
    { at: [-(h + 1), 0], size: [2, 2 * h + 4], yawDeg: 0 },
    { at: [h + 1, 0], size: [2, 2 * h + 4], yawDeg: 0 },
  ]
  return { boxes, waypoints: [] }
}

/** the car's turning circle has a radius of ~10 m (steering 0.1 x wheel angle 1 per metre), so a pocket narrower than ~14 m cannot be turned in */
export const BAY_HALL_HALF = 38
export const BAY_HALL_BACK_Z = 24
export const BAY_HALL_FRONT_Z = -62

/**
 * `bay` (v3 reversal setup): a hall (76 x 86 m, the car starts at the origin facing -Z) whose front wall has one opening, a dead-end bay 12.5-14 m wide and
 * 20-32 m deep: too narrow for a U-turn (or a three-point turn), so a car that drove in has to reverse out. layout: bx (bay centre x), bw, bd (depth).
 */
function bayCourse(rng: Rng): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  const hx = BAY_HALL_HALF
  const zb = BAY_HALL_BACK_Z
  const zf = BAY_HALL_FRONT_Z
  const bw = range(rng, 12.5, 14)
  const bd = range(rng, 20, 32)
  const bx = range(rng, -12, 12)
  const boxes: CourseBox[] = []
  const t = 2
  boxes.push({ at: [0, zb + t / 2], size: [2 * hx + 2 * t, t], yawDeg: 0 })
  for (const side of [-1, 1]) boxes.push({ at: [side * (hx + t / 2), (zb + zf) / 2], size: [t, zb - zf + t], yawDeg: 0 })
  // front wall left and right of the opening
  const left0 = -hx - t
  const left1 = bx - bw / 2
  boxes.push({ at: [(left0 + left1) / 2, zf - t / 2], size: [left1 - left0, t], yawDeg: 0 })
  const right0 = bx + bw / 2
  const right1 = hx + t
  boxes.push({ at: [(right0 + right1) / 2, zf - t / 2], size: [right1 - right0, t], yawDeg: 0 })
  // pocket: side walls from the front wall plane to the back wall
  for (const side of [-1, 1]) boxes.push({ at: [bx + side * (bw / 2 + t / 2), zf - t - bd / 2], size: [t, bd], yawDeg: 0 })
  boxes.push({ at: [bx, zf - t - bd - t / 2], size: [bw + 2 * t, t], yawDeg: 0 })
  return { boxes, waypoints: [], layout: { bx, bw, bd, zFront: zf - t, hx, zBack: zb } }
}

/**
 * `corridor` (v3 reversal setup): a straight closed corridor 12.5-14 m wide, 22-34 m behind the start and 70-110 m ahead of it, dead ends on both sides:
 * no U-turn or three-point turn is possible, every direction change has to be driven in reverse. layout: cw (width), rear (m behind the start), ahead (m ahead).
 */
function corridorCourse(rng: Rng): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  const cw = range(rng, 12.5, 14)
  const rear = range(rng, 22, 34)
  const ahead = range(rng, 70, 110)
  const t = 2
  const boxes: CourseBox[] = []
  const len = rear + ahead
  for (const side of [-1, 1]) boxes.push({ at: [side * (cw / 2 + t / 2), (rear - ahead) / 2], size: [t, len + 2 * t], yawDeg: 0 })
  boxes.push({ at: [0, rear + t / 2], size: [cw, t], yawDeg: 0 })
  boxes.push({ at: [0, -ahead - t / 2], size: [cw, t], yawDeg: 0 })
  return { boxes, waypoints: [], layout: { cw, rear, ahead } }
}

/** number of lanes of the grid serpentine */
export const GRID_LANES = 5
/** lane width range of the grid serpentine (m): >= 24 so the U-turn (two 90 degree corners ~a lane width apart, vs the car's ~20 m min-turn diameter) is sharp but drivable */
export const GRID_LANE_W_RANGE = [24, 28] as const
/** lane length range of the grid serpentine (m along -z, open turning tip to open turning tip) */
export const GRID_LEN_RANGE = [56, 72] as const
/** width range of the seeded mid-gaps in some dividers (m): >= 10 so the inflated A* (car half width 2 + 2.5 m margin) can pass */
export const GRID_GAP_RANGE = [10, 13] as const
/** depth of the OPEN turning strip at a divider tip (m, tip to end wall): the U-turn hairpin corridor */
export const GRID_STRIP = 20
/** depth of the SEALED strip at a divider tip (m): no cell inside keeps 2 m + 1.5 m of clearance, the strip cannot be crossed there */
export const GRID_SEAL = 6

/**
 * `grid` (v3 setup kind): a closed walled serpentine of GRID_LANES lanes with LOTS OF SHARP U-TURNS. The car starts at the near strip of
 * lane 0 facing -Z; the divider tips are staggered (GRID_STRIP open / GRID_SEAL sealed, alternating ends), so lane i is only connected to
 * lane i+1 at ONE end: the serpentine with a U-turn (two ~90 degree corners one lane width apart, >= 24 m turning diameter) at the end of
 * every lane is the only lane sequence to the far lanes. The seeded mid-gaps in some dividers are narrow detours; the hairpins stay the
 * dominant task. Chains (chains.ts) end at the lane mouths: 1-4 U-turns per chain.
 * layout: laneW, len (open tip to open tip), zFar / zNear (the far / near lane mouth lines), lanes.
 *
 * adversarial G1 (adversarialStyle 0, failure class "mid-hairpin entry"): laneW pinned to 24 (the minimum of the standard range, so every
 * U-turn is two 90 degree corners exactly 24 m apart) and the open turning strips tightened to 15-16 m instead of 20 (the target range is
 * 12-16, but below 15 no fillet of CORNER_RADII fits: two 90 degree arcs of the 10 m radius plus the 2.5 m exact chain clearance need
 * >= 15 m of strip - and the car's tightest turn is ~10 m radius anyway). The near end wall keeps its standard 8 m distance behind the
 * start (zBack), only the divider tips move. layout additionally carries `strip`.
 */
function gridCourse(rng: Rng, advStyle: 0 | 1 | undefined): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  const laneW = advStyle === 0 ? 24 : range(rng, GRID_LANE_W_RANGE[0], GRID_LANE_W_RANGE[1])
  const len = range(rng, GRID_LEN_RANGE[0], GRID_LEN_RANGE[1])
  const strip = advStyle === 0 ? 15 + rng.next() : GRID_STRIP
  const lanes = GRID_LANES
  const width = lanes * laneW
  const t = 2
  // end wall inner faces: 8 m behind the start / at -(len - 8) (interior depth len); the divider tips sit `strip` (open) or GRID_SEAL
  // (sealed) from them
  const zBack = GRID_STRIP - 12
  const zEnd = -(len - strip + 12)
  const zFar = zEnd + strip / 2
  const zNear = zBack - strip / 2
  const boxes: CourseBox[] = []
  boxes.push({ at: [width / 2, zBack + t / 2], size: [width + 2 * t, t], yawDeg: 0 })
  boxes.push({ at: [width / 2, zEnd - t / 2], size: [width + 2 * t, t], yawDeg: 0 })
  const wallTop = zBack + t
  const wallBot = zEnd - t
  boxes.push({ at: [-laneW / 2 - t / 2, (wallTop + wallBot) / 2], size: [t, wallTop - wallBot], yawDeg: 0 })
  boxes.push({ at: [width - laneW / 2 + t / 2, (wallTop + wallBot) / 2], size: [t, wallTop - wallBot], yawDeg: 0 })
  // dividers: divider i (between lane i and i+1) opens at the far end for even i, at the near end for odd i (the serpentine alternates)
  const divSpan = (i: number): [number, number] => (i % 2 === 0 ? [zBack - GRID_SEAL, zEnd + strip] : [zBack - strip, zEnd + GRID_SEAL])
  // 1-2 seeded mid-gaps in distinct dividers of the FAR half (dividers 2..): an early gap would sit on the prefix of every chain and
  // short-circuit the first hairpins; a late one is a narrow detour that leaves the U-turns dominant
  const dividers = Array.from({ length: lanes - 1 }, (_, i) => i).filter((i) => i >= 2)
  for (let i = dividers.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[dividers[i], dividers[j]] = [dividers[j]!, dividers[i]!]
  }
  // adversarial G2 builds a PURE serpentine: a seeded mid-gap near the next-lane interior ends would short-circuit the last hairpin
  // (the gap detour is a different, much easier task than the endgame this setup mines)
  const nGaps = advStyle === 1 ? 0 : 1 + (rng.next() < 0.5 ? 1 : 0)
  const gaps = new Map<number, { z: number; w: number }>()
  for (let i = 0; i < nGaps; i++) gaps.set(dividers[i % dividers.length]!, { z: 0, w: range(rng, GRID_GAP_RANGE[0], GRID_GAP_RANGE[1]) })
  for (let i = 0; i < lanes - 1; i++) {
    const x = (i + 0.5) * laneW
    const [zN, zF] = divSpan(i)
    const gap = gaps.get(i)
    if (!gap) {
      boxes.push({ at: [x, (zN + zF) / 2], size: [1, zN - zF], yawDeg: 0 })
      continue
    }
    gap.z = zN - (0.3 + 0.4 * rng.next()) * (zN - zF)
    boxes.push({ at: [x, (zN + gap.z + gap.w / 2) / 2], size: [1, gap.z + gap.w / 2 - zN], yawDeg: 0 })
    boxes.push({ at: [x, (gap.z - gap.w / 2 + zF) / 2], size: [1, zF - (gap.z - gap.w / 2)], yawDeg: 0 })
  }
  // the serpentine through the lane centres: the mouths of every lane in driving order, alternating far / near
  const waypoints: V2[] = []
  for (let i = 0; i < lanes; i++) {
    const z = i % 2 === 0 ? zFar : zNear
    waypoints.push([i * laneW, z])
    if (i + 1 < lanes) waypoints.push([(i + 1) * laneW, z])
  }
  return { boxes, waypoints, layout: { laneW, len, zFar, zNear, lanes, ...(advStyle === 0 ? { strip } : {}) } }
}

// --- widen-freeze kinds (2026-10-13): reversal-heavy + forward obstacle-avoidance, geometry re-seeded per variant -------------

/**
 * `rslalom` (v3 reversal setup kind): a REVERSE slalom — a corridor too narrow to turn in (13.5-15.5 m vs the ~20 m
 * minimum turning diameter) with staggered pillars, each leaving ONE open gap of 7.5-9.5 m, and the car starts at the
 * near end FACING THE REAR WALL (startYawDeg 180): the chains lead to the far end 90-140 m away, so reaching one
 * means threading every gap IN REVERSE the whole way — a full-length reverse chain with steering, not the short
 * back-out hops of bay / corridor. Shared by `rslalomCourse` (the Course) and the chain generator (v3Chains.ts).
 */
export interface RslalomPillar {
  z: number
  side: -1 | 1
  /** pillar width across the corridor (m) */
  w: number
  /** the OPEN gap between the pillar's inner edge and the opposite wall (m) */
  gap: number
}

export interface RslalomWorld {
  boxes: CourseBox[]
  layout: Record<string, number>
  startYawDeg: number
  pillars: RslalomPillar[]
  /** the base weave line through the open gap of every pillar (the chain generator's route) */
  weave: V2[]
}

export function rslalomWorld(seed: number, variant: number): RslalomWorld {
  const rng = variantRng('rslalom', seed, variant)
  const cw = range(rng, 13.5, 15.5)
  const rear = range(rng, 10, 16)
  const ahead = range(rng, 90, 140)
  const t = 2
  const boxes: CourseBox[] = []
  const len = rear + ahead
  for (const side of [-1, 1]) boxes.push({ at: [side * (cw / 2 + t / 2), (rear - ahead) / 2], size: [t, len + 2 * t], yawDeg: 0 })
  boxes.push({ at: [0, rear + t / 2], size: [cw, t], yawDeg: 0 })
  boxes.push({ at: [0, -ahead - t / 2], size: [cw, t], yawDeg: 0 })
  const pillars: RslalomPillar[] = []
  let side = rng.next() < 0.5 ? -1 : 1
  for (let z = -18; z > -ahead + 16; z -= range(rng, 20, 27)) {
    const w = range(rng, 3, 4.5)
    const gap = range(rng, 7.5, 9.5)
    // the pillar hugs its OWN wall (a = the inner edge's x, toward the middle); the open gap lies at the opposite wall
    const a = gap - cw / 2
    boxes.push({ at: [side * (a + w / 2), z], size: [w, 3], yawDeg: 0 })
    pillars.push({ z, side: side as -1 | 1, w, gap })
    side = -side
  }
  const weave: V2[] = pillars.map((p) => [-p.side * ((cw - p.gap) / 2), p.z])
  return { boxes, layout: { cw, rear, ahead, nPillars: pillars.length }, startYawDeg: 180, pillars, weave }
}

/**
 * `deadend` (v3 reversal setup kind): a dead-end hall with TWO bays of independently seeded width / depth / position
 * (12.5-14 m wide — no U-turn — 16-26 m deep) in its front wall: more variety than `bay`'s single pocket. The chains
 * pull into a bay, back out, and either exit or cross the hall into the OTHER bay and back out again — two full
 * reversals with forward arcs between them.
 */
export interface DeadendBay {
  /** bay mouth centre x */
  ax: number
  /** bay width (m) */
  aw: number
  /** bay depth beyond the front wall (m) */
  ad: number
  /** the chain's aim line deep inside the bay (z) */
  tip: number
  /** the approach line in front of the bay mouth (z) */
  mouth: number
  /** the reverse-out target inside the hall (z) */
  retreat: number
}

export interface DeadendWorld {
  boxes: CourseBox[]
  layout: Record<string, number>
  /** bays[0] = the LEFT bay (A), bays[1] = the RIGHT bay (B) */
  bays: [DeadendBay, DeadendBay]
  exits: { left: V2; right: V2; back: V2 }
}

export function deadendWorld(seed: number, variant: number): DeadendWorld {
  const rng = variantRng('deadend', seed, variant)
  const hx = range(rng, 20, 26)
  const zBack = 14
  const zFront = -30
  const t = 2
  const boxes: CourseBox[] = []
  boxes.push({ at: [0, zBack + t / 2], size: [2 * hx + 2 * t, t], yawDeg: 0 })
  for (const side of [-1, 1]) boxes.push({ at: [side * (hx + t / 2), (zBack + zFront) / 2], size: [t, zBack - zFront + t], yawDeg: 0 })
  const mkBay = (bx: number, bw: number, bd: number): DeadendBay => {
    // the pocket sticks out beyond the front wall: side walls from the front wall plane to the bay's back wall
    for (const side of [-1, 1]) boxes.push({ at: [bx + side * (bw / 2 + t / 2), zFront - t - bd / 2], size: [t, bd], yawDeg: 0 })
    boxes.push({ at: [bx, zFront - t - bd - t / 2], size: [bw + 2 * t, t], yawDeg: 0 })
    return { ax: bx, aw: bw, ad: bd, tip: zFront - t - bd + 4, mouth: zFront + 8, retreat: zFront + 10 }
  }
  const bA = mkBay(range(rng, -hx + 8, -9), range(rng, 12.5, 14), range(rng, 16, 26))
  const bB = mkBay(range(rng, 9, hx - 8), range(rng, 12.5, 14), range(rng, 16, 26))
  // the front wall in the three segments between the hall walls and the two bay mouths
  const seg = (x0: number, x1: number) => boxes.push({ at: [(x0 + x1) / 2, zFront - t / 2], size: [x1 - x0, t], yawDeg: 0 })
  seg(-hx - t, bA.ax - bA.aw / 2)
  seg(bA.ax + bA.aw / 2, bB.ax - bB.aw / 2)
  seg(bB.ax + bB.aw / 2, hx + t)
  return {
    boxes,
    layout: { hx, zBack, zFront, axA: bA.ax, awA: bA.aw, adA: bA.ad, axB: bB.ax, awB: bB.aw, adB: bB.ad },
    bays: [bA, bB],
    exits: { left: [-range(rng, 9, hx - 5), range(rng, -6, 4)], right: [range(rng, 9, hx - 5), range(rng, -6, 4)], back: [range(rng, -4, 4), range(rng, 6, 10)] },
  }
}

/**
 * The kturn maneuver worlds (Rangieren plan, 2026-10-19): the car starts at the origin facing -Z and the goal
 * lies BEHIND or to the SIDE, so the chain (laid by the maneuver search, kturnChains.ts) is a multi-move turning
 * sequence with reverse phases — 1-/3-/5-Zug depending on the goal. `ends` are the target points (one chain per
 * end); the search guarantees hull-cleared moves over the REAL 4x8 footprint, so the geometry ranges only need
 * to keep the worlds tight, not drivable by hand-laid legs.
 */
export interface KturnWorld {
  boxes: CourseBox[]
  layout: Record<string, number>
  /** target points, one chain per end (the maneuver search decides the moves) */
  ends: V2[]
  /** the canonical start (the Course keeps it at the origin; jitterStart varies it per variant) */
  start: V2
  startYawDeg: number
}

/**
 * `pocket` (kturn): a maze dead-end pocket 14-17 m wide and 22-28 m deep — too narrow for the ~10 m turning
 * circle's 20 m U-sweep, so every re-orientation inside is a real multi-move K. The car starts deep inside,
 * 10 m off the back wall, facing it. The target ends: the two BACK CORNERS of the pocket (the tight in-place
 * manoeuvres — the walls block both the long forward arc and the long reverse swing) and the straight-out
 * point across the mouth's room (the 1-Zug pure reverse). Bearing varies per end, so the move count does too.
 */
export function pocketWorld(seed: number, variant: number): KturnWorld {
  const rng = variantRng('pocket', seed, variant)
  const pw = range(rng, 14, 17)
  const pd = range(rng, 22, 28)
  const md = pd - 10
  const rd = range(rng, 20, 26)
  const hx = pw / 2 + range(rng, 8, 12)
  const t = 2
  const boxes: CourseBox[] = []
  boxes.push({ at: [0, -10 - t / 2], size: [pw + 2 * t, t], yawDeg: 0 })
  for (const side of [-1, 1]) boxes.push({ at: [side * (pw / 2 + t / 2), (md - 10) / 2], size: [t, pd + 2 * t], yawDeg: 0 })
  for (const side of [-1, 1]) boxes.push({ at: [side * (hx + t / 2), md + (rd + t) / 2], size: [t, rd + 2 * t], yawDeg: 0 })
  boxes.push({ at: [0, md + rd + t / 2], size: [2 * hx + 2 * t, t], yawDeg: 0 })
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -hx - t : pw / 2 + t
    const x1 = side < 0 ? -pw / 2 - t : hx + t
    boxes.push({ at: [(x0 + x1) / 2, md - t / 2], size: [x1 - x0, t], yawDeg: 0 })
  }
  return {
    boxes,
    layout: { pw, pd, md, rd, hx },
    ends: [
      [-(pw / 2 - 3), -6],
      [pw / 2 - 3, -6],
      [0, md + rd - 8],
    ],
    start: [0, 0],
    startYawDeg: 0,
  }
}

/**
 * `tee` (kturn): a T-intersection — a 12-14 m stem (rear wall 16-22 m behind the start) meeting a tight
 * 12.5-14 m cross arm 14-20 m ahead: the arm is of the proven "cannot U-turn" width class, so the swing into
 * the arm ends left / right of the junction is a K, not a single arc. The straight-ahead end (arm centre
 * line) is the 1-Zug baseline: pure forward.
 */
export function teeWorld(seed: number, variant: number): KturnWorld {
  const rng = variantRng('tee', seed, variant)
  const cw = range(rng, 12, 14)
  const rear = range(rng, 16, 22)
  const ahead = range(rng, 14, 20)
  const aw = range(rng, 12.5, 14)
  const ahx = range(rng, 18, 24)
  const t = 2
  const boxes: CourseBox[] = []
  boxes.push({ at: [0, rear + t / 2], size: [cw, t], yawDeg: 0 })
  const zInner = -ahead + aw / 2
  for (const side of [-1, 1]) boxes.push({ at: [side * (cw / 2 + t / 2), (rear + zInner) / 2], size: [t, rear - zInner + 2 * t], yawDeg: 0 })
  boxes.push({ at: [0, -ahead - aw / 2 - t / 2], size: [2 * ahx + 2 * t, t], yawDeg: 0 })
  for (const side of [-1, 1]) boxes.push({ at: [side * (ahx + t / 2), -ahead], size: [t, aw + 2 * t], yawDeg: 0 })
  return {
    boxes,
    layout: { cw, rear, ahead, aw, ahx },
    ends: [
      [0, -ahead],
      [-(ahx - 5), -ahead],
      [ahx - 5, -ahead],
    ],
    start: [0, 0],
    startYawDeg: 0,
  }
}

/**
 * `hall` (kturn): a wide dead-end hall (24-34 m — a single U-arc WOULD fit) whose back wall carries two
 * PARKING BAYS (9-11 m wide, 10-14 m deep, left and right of the start): the goals are the bay tips. The bay
 * walls forbid the single continuous swing, so reaching a tip is a multi-move alignment (drive in part-way,
 * reverse to straighten, forward to the tip) — the Sackgassenhalle rangieren. The third end is the straight
 * reverse out of the hall's mouth (the 1-Zug baseline).
 */
export function hallWorld(seed: number, variant: number): KturnWorld {
  const rng = variantRng('hall', seed, variant)
  const hw = range(rng, 24, 34)
  const hl = range(rng, 28, 38)
  const md = hl - 10
  const rd = range(rng, 18, 24)
  const hx = hw / 2 + range(rng, 6, 10)
  const bayW = range(rng, 9, 11)
  const bayD = range(rng, 10, 14)
  const bxA = -range(rng, hw / 4, hw / 3)
  const bxB = range(rng, hw / 4, hw / 3)
  const t = 2
  const boxes: CourseBox[] = []
  // back wall in the three segments between the hall walls and the two bay mouths
  const seg = (x0: number, x1: number) => boxes.push({ at: [(x0 + x1) / 2, -10 - t / 2], size: [x1 - x0, t], yawDeg: 0 })
  seg(-hw - t, bxA - bayW / 2)
  seg(bxA + bayW / 2, bxB - bayW / 2)
  seg(bxB + bayW / 2, hw + t)
  // the two bays: side walls from the back wall plane to the bay's back wall
  const mkBay = (bx: number) => {
    for (const side of [-1, 1]) boxes.push({ at: [bx + side * (bayW / 2 + t / 2), -10 - t - bayD / 2], size: [t, bayD], yawDeg: 0 })
    boxes.push({ at: [bx, -10 - t - bayD - t / 2], size: [bayW + 2 * t, t], yawDeg: 0 })
    return [bx, -10 - t - bayD + 3] as V2
  }
  const tipA = mkBay(bxA)
  const tipB = mkBay(bxB)
  for (const s of [-1, 1]) boxes.push({ at: [s * (hw / 2 + t / 2), (md - 10) / 2], size: [t, hl + 2 * t], yawDeg: 0 })
  for (const s of [-1, 1]) boxes.push({ at: [s * (hx + t / 2), md + (rd + t) / 2], size: [t, rd + 2 * t], yawDeg: 0 })
  boxes.push({ at: [0, md + rd + t / 2], size: [2 * hx + 2 * t, t], yawDeg: 0 })
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -hx - t : hw / 2 + t
    const x1 = s < 0 ? -hw / 2 - t : hx + t
    boxes.push({ at: [(x0 + x1) / 2, md - t / 2], size: [x1 - x0, t], yawDeg: 0 })
  }
  return {
    boxes,
    layout: { hw, hl, md, rd, hx, bayW, bayD, bxA, bxB },
    ends: [tipA, tipB, [0, md + rd - 8]],
    start: [0, 0],
    startYawDeg: 0,
  }
}

/** kturn world of a setup kind (the chain generator calls the world functions directly, like deadendWorld). */
export function kturnWorld(kind: CourseKind, seed: number, variant: number): KturnWorld {
  if (kind === 'pocket') return pocketWorld(seed, variant)
  if (kind === 'tee') return teeWorld(seed, variant)
  if (kind === 'hall') return hallWorld(seed, variant)
  throw new Error(`kturnWorld: ${kind} is not a kturn kind`)
}

/**
 * `gates` (v3 forward obstacle-avoidance setup kind): a closed corridor (26-32 m) whose alternating wall stubs leave
 * exactly ONE opening of 9.5-12 m per gate — the openings alternate sides, so forward progress means a slalom through
 * tight gates, and the raised touch penalties price every stub contact. NO extra obstacles: a single opening per gate
 * must never be plugged (measured: the first design's small middle boxes blocked the only free column and the
 * planner rejected every setup). Chains come from the standard grid planner (like field / slalom / crowd); the
 * 2.5 m inflation margin often does not fit a 9.5-12 m opening, so the 1.5 fallback margin does the enumeration —
 * the EXACT clearance gate (>= 2.5 m) still holds for every accepted chain.
 */
function gatesCourse(seed: number, variant: number): Pick<Course, 'boxes' | 'waypoints'> {
  const rng = variantRng('gates', seed, variant)
  const hw = range(rng, 13, 16)
  const boxes: CourseBox[] = []
  for (let z = 20; z > -COURSE_LENGTH - 20; z -= 40) for (const side of [-1, 1]) boxes.push({ at: [side * (hw + 1), z - 20], size: [2, 40], yawDeg: 0 })
  boxes.push({ at: [0, 24], size: [2 * hw + 2, 2], yawDeg: 0 })
  boxes.push({ at: [0, -COURSE_LENGTH - 24], size: [2 * hw + 2, 2], yawDeg: 0 })
  let side = rng.next() < 0.5 ? -1 : 1
  for (let z = -30; z > -COURSE_LENGTH + 24; z -= range(rng, 20, 28)) {
    const gap = range(rng, 9.5, 12)
    const stub = 2 * hw - gap
    boxes.push({ at: [side * (hw - stub / 2), z], size: [stub, 2], yawDeg: 0 })
    side = -side
  }
  return { boxes, waypoints: [[0, -COURSE_LENGTH]] }
}

/**
 * `dense` (v3 forward obstacle-avoidance setup kind): a closed corridor (28-34 m) packed with a DENSE lattice of
 * small jittered boxes — a row every 10-14 m holding 2-4 boxes at seeded x positions with >= 10 m edge-to-edge gaps
 * — many routes exist, all of them demanding close quarters without contact. Chains from the standard grid planner.
 */
function denseCourse(seed: number, variant: number): Pick<Course, 'boxes' | 'waypoints'> {
  const rng = variantRng('dense', seed, variant)
  const hw = range(rng, 14, 17)
  const boxes: CourseBox[] = []
  for (let z = 20; z > -COURSE_LENGTH - 20; z -= 40) for (const side of [-1, 1]) boxes.push({ at: [side * (hw + 1), z - 20], size: [2, 40], yawDeg: 0 })
  boxes.push({ at: [0, 24], size: [2 * hw + 2, 2], yawDeg: 0 })
  boxes.push({ at: [0, -COURSE_LENGTH - 24], size: [2 * hw + 2, 2], yawDeg: 0 })
  // rows every 16-20 m (z) hold 1-3 boxes at seeded x with >= 10 m edge-to-edge gaps: adjacent rows' gaps must stay
  // diagonally connectable — tighter row spacing let two rows conspire to block every path (measured: 78 % of the
  // variants rejected) — and the small yaw keeps the boxes' effective width predictable
  for (let z = -28; z > -COURSE_LENGTH + 24; z -= range(rng, 16, 20)) {
    const row: Array<[number, number]> = [] // [x, half-width-across] of the accepted boxes
    for (let i = 0; i < 3; i++) {
      if (i > 0 && rng.next() < 0.5) break // 1-3 boxes per row
      const w = range(rng, 2, 4)
      let x = 0
      let ok = false
      for (let attempt = 0; attempt < 12 && !ok; attempt++) {
        x = range(rng, -(hw - 3), hw - 3)
        // >= 10 m edge-to-edge to every box of the row (the planner's first inflation margin is 4.5 m)
        ok = row.every(([rx, rw]) => Math.abs(rx - x) >= rw + w / 2 + 10)
        if (ok) row.push([x, w / 2])
      }
      if (ok) boxes.push({ at: [x, z - range(rng, -1.5, 1.5)], size: [w, range(rng, 2, 4)], yawDeg: range(rng, -15, 15) })
    }
  }
  return { boxes, waypoints: [[0, -COURSE_LENGTH]] }
}

// --- obstacle-fluency kinds (2026-10-14): DETOUR worlds — the target vector points THROUGH an obstacle ---------

/**
 * `blockade` (v3 detour setup kind): a bounded plaza whose TARGET sits 160-200 m ahead, with 2-4 TRANSVERSE WALL
 * PAIRS crossing the direct start -> target line: each wall's opening sits MID-PLAZA (T1 user-authorized course
 * change 2026-10-15 — see the measured reason below), its centre seeded in a band across the plaza width and the
 * sides ALTERNATING, so forward progress is still a sequence of committed lateral swings, but the swing is
 * PROPORTIONATE: opening centres land 14-21 m off the middle band the target line runs in (the demonstrated
 * learnable band — the net finishes `blocks` arcs of 1-13 m; the old side-wall-hugging openings demanded
 * hw = 34-42 m). Every wall still SPANS ACROSS x = 0 (both segments cover the middle band), so the direct line
 * passes THROUGH a wall whatever the jittered start / target x (|x| <= 6, the opening's near edge stays
 * >= 8 m off x = 0). The opening always fits the planner's 2.5 m inflation (>= 12 m), so the world is solvable
 * by construction. layout: hw (plaza half width), tx / tz (the target), t (wall thickness), openMin / openMax
 * of the seeded opening band.
 */
function blockadeCourse(seed: number, variant: number): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  const rng = variantRng('blockade', seed, variant)
  const hw = range(rng, 34, 42)
  const tz = -Math.round(range(rng, 160, 200))
  const tx = range(rng, -6, 6)
  const t = 2
  const boxes: CourseBox[] = []
  // the plaza: side walls from behind the start to beyond the target, back and end wall
  boxes.push({ at: [0, 24], size: [2 * hw + 2 * t, t], yawDeg: 0 })
  boxes.push({ at: [0, tz - 24], size: [2 * hw + 2 * t, t], yawDeg: 0 })
  for (const side of [-1, 1]) boxes.push({ at: [side * (hw + t / 2), tz / 2], size: [t, 44 - tz + 2 * t], yawDeg: 0 })
  const openMin = 12
  const openMax = 18
  let side = rng.next() < 0.5 ? -1 : 1
  for (let z = -range(rng, 42, 55); z > tz + range(rng, 34, 50); z -= range(rng, 40, 58)) {
    const open = range(rng, openMin, openMax)
    // opening centre: mid-plaza band, 14-21 m off x = 0 — near edge >= 8 m keeps the whole jittered line
    // (|x| <= 6) inside the wall (the direct line always demands the swing), far edge <= hw - 4 keeps the
    // outer wall segment a real wall whatever the seeded centre
    const centre = side * range(rng, open / 2 + 8, Math.min(hw - open / 2 - 3, 21))
    const ac = Math.abs(centre)
    const sgn = Math.sign(centre) || 1
    // the wall is TWO SEGMENTS with the seeded opening between them: the inner segment always spans across
    // x = 0 (its edge at the opening stays >= 8 m past the middle), the outer segment closes the plaza to
    // the side wall — same total wall coverage as the old one-piece wall, only the opening moved mid-plaza
    boxes.push({ at: [(sgn * (ac - open / 2 - hw)) / 2, z], size: [ac - open / 2 + hw, t], yawDeg: 0 })
    boxes.push({ at: [(sgn * (ac + open / 2 + hw)) / 2, z], size: [hw - ac - open / 2, t], yawDeg: 0 })
    side = -side
  }
  return { boxes, waypoints: [[tx, tz]], layout: { hw, tx, tz, t, openMin, openMax } }
}

/**
 * `blocks` (v3 detour setup kind): the same bounded plaza frame with 3-5 BIG BLOCKS (12-22 m across, yaw-jittered)
 * between the start and the target 140-180 m ahead. Block 0 is pinned ON the direct start -> target line (its centre
 * within ~4 m of the line's x at its z), so the target vector points INTO it; the others scatter with >= 12 m
 * edge-to-edge corridors (block to block and block to side wall — the planner passes them at the 2.5 m margin) and
 * the start / target neighbourhoods stay clear. Unlike `dense` (small boxes, many routes close by) the obstacles are
 * FAT: the detour around one is a wide arc the car must commit to early.
 */
function blocksCourse(seed: number, variant: number): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  const rng = variantRng('blocks', seed, variant)
  const hw = range(rng, 38, 46)
  const tz = -Math.round(range(rng, 140, 180))
  const tx = range(rng, -5, 5)
  const t = 2
  const boxes: CourseBox[] = []
  boxes.push({ at: [0, 24], size: [2 * hw + 2 * t, t], yawDeg: 0 })
  boxes.push({ at: [0, tz - 24], size: [2 * hw + 2 * t, t], yawDeg: 0 })
  for (const side of [-1, 1]) boxes.push({ at: [side * (hw + t / 2), tz / 2], size: [t, 44 - tz + 2 * t], yawDeg: 0 })
  const placed: Array<{ x: number; z: number; w: number; d: number; yawDeg: number }> = []
  const clearOf = (x: number, z: number, w: number, d: number, gap: number): boolean => {
    // axis-aligned half extents (the yaw stays <= 25 deg, the bounding box is a fair proxy for the corridor test)
    const bx = (w / 2) * Math.cos((25 * Math.PI) / 180) + (d / 2) * Math.sin((25 * Math.PI) / 180)
    const bz = (w / 2) * Math.sin((25 * Math.PI) / 180) + (d / 2) * Math.cos((25 * Math.PI) / 180)
    if (Math.abs(x) + bx > hw - gap) return false // >= gap corridor to each side wall
    if (z > -28 || z < tz + 28) return false // the start / target neighbourhoods stay clear
    for (const p of placed) {
      const pbx = (p.w / 2) * Math.cos((25 * Math.PI) / 180) + (p.d / 2) * Math.sin((25 * Math.PI) / 180)
      const pbz = (p.w / 2) * Math.sin((25 * Math.PI) / 180) + (p.d / 2) * Math.cos((25 * Math.PI) / 180)
      if (Math.abs(p.x - x) < pbx + bx + gap && Math.abs(p.z - z) < pbz + bz + gap) return false
    }
    return true
  }
  const put = (x: number, z: number, w: number, d: number): void => {
    const yawDeg = range(rng, -25, 25)
    boxes.push({ at: [x, z], size: [w, d], yawDeg })
    placed.push({ x, z, w, d, yawDeg })
  }
  // block 0: pinned ON the direct line — the line's x at z is tx * (z / tz) (start x 0), keep |centre x - line x| <= 4
  {
    const z0 = -range(rng, 0.4, 0.65) * -tz
    const w0 = range(rng, 14, 22)
    const d0 = range(rng, 12, 20)
    const lx = (tx * z0) / tz
    const x0 = Math.max(-hw + w0 / 2 + 12, Math.min(hw - w0 / 2 - 12, lx + range(rng, -4, 4)))
    put(x0, z0, w0, d0)
  }
  // blocks 1..: scattered, >= 12 m corridors, rejection-sampled (the world is solvable by construction);
  // the corridor requirement relaxes to 10 m for the stragglers so the block COUNT is guaranteed (still
  // comfortably planner-passable at the 2.5 m margin)
  const nMore = 2 + Math.floor(rng.next() * 3)
  for (let i = 0; i < nMore; i++) {
    let placedI = false
    for (const gap of [12, 10]) {
      for (let attempt = 0; attempt < 40 && !placedI; attempt++) {
        const w = range(rng, 12, 22)
        const d = range(rng, 10, 20)
        const x = range(rng, -(hw - w / 2 - gap), hw - w / 2 - gap)
        const z = range(rng, tz + 28, -28)
        if (clearOf(x, z, w, d, gap)) {
          put(x, z, w, d)
          placedI = true
        }
      }
      if (placedI) break
    }
  }
  return { boxes, waypoints: [[tx, tz]], layout: { hw, tx, tz, t, nBlocks: placed.length } }
}

/** `rslalom` as a Course: the world without the chain-generator extras (the generator calls `rslalomWorld` directly). */
function rslalomCourse(seed: number, variant: number): Pick<Course, 'boxes' | 'waypoints' | 'layout' | 'startYawDeg'> {
  const w = rslalomWorld(seed, variant)
  return { boxes: w.boxes, waypoints: [], layout: w.layout, startYawDeg: w.startYawDeg }
}

/** `deadend` as a Course (the chain generator calls `deadendWorld` directly). */
function deadendCourse(seed: number, variant: number): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  const w = deadendWorld(seed, variant)
  return { boxes: w.boxes, waypoints: [], layout: w.layout }
}

/** The kturn kinds as Courses (the maneuver generator calls the world functions directly, like deadend). */
function kturnCourse(kind: CourseKind, seed: number, variant: number): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  const w = kturnWorld(kind, seed, variant)
  return { boxes: w.boxes, waypoints: [], layout: w.layout }
}

const MAZE_CELLS = 6
const MAZE_PITCH = 16

/**
 * adversarial M2 (adversarialStyle 1, failure class "lateral start leg"): the start heading is turned ~90 degrees off the canonical
 * heading (which points at the first route cell), so the chain's first leg is ~90 degrees off the direction the car faces at t=0 - it must
 * swing the ~10 m turning circle through the open side cell to get onto it. 180 degree starts are not discriminative; only ~90 is.
 * The heading faces the OPEN perpendicular side of the start cell (see the body); the M2 chains carry a wider offcourse tolerance
 * (offM 16, chains.ts) because the start swing leaves the chain by up to ~12 m - with the default 6 m even the pure-pursuit baseline
 * goes offcourse at 2 m progress.
 */
function mazeCourse(seed: number, rng: Rng, advStyle: 0 | 1 | undefined): Pick<Course, 'boxes' | 'waypoints' | 'startYawDeg'> {
  const maze = generateMaze({ seed, cols: MAZE_CELLS, rows: MAZE_CELLS, cell: MAZE_PITCH, loopFraction: 0.1, goalDist: 0 })
  const startCol = Math.floor(rng.next() * MAZE_CELLS)
  const startRow = MAZE_CELLS - 1
  const exitRow = 0
  // shortest route over the cell graph (breadth first)
  const key = (c: number, r: number) => r * MAZE_CELLS + c
  const prev = new Map<number, number>([[key(startCol, startRow), -1]])
  const queue: Array<[number, number]> = [[startCol, startRow]]
  for (let qi = 0; qi < queue.length; qi++) {
    const [c, r] = queue[qi]!
    const next: Array<[number, number]> = []
    if (r > 0 && !maze.hWall[r]![c]) next.push([c, r - 1])
    if (r < MAZE_CELLS - 1 && !maze.hWall[r + 1]![c]) next.push([c, r + 1])
    if (c > 0 && !maze.vWall[r]![c]) next.push([c - 1, r])
    if (c < MAZE_CELLS - 1 && !maze.vWall[r]![c + 1]) next.push([c + 1, r])
    for (const [nc, nr] of next) {
      if (prev.has(key(nc, nr))) continue
      prev.set(key(nc, nr), key(c, r))
      queue.push([nc, nr])
    }
  }
  const route: Array<[number, number]> = []
  for (let k = key(maze.exitCol, exitRow); k !== -1; k = prev.get(k)!) route.unshift([k % MAZE_CELLS, Math.floor(k / MAZE_CELLS)])
  // world frame: the start cell centre is the origin
  const [sx, sz] = cellCentre(maze, startCol, startRow)
  const shift = (p: V2): V2 => [p[0] - sx, p[1] - sz]
  const waypoints: V2[] = route.slice(1).map(([c, r]) => shift(cellCentre(maze, c, r)))
  const [ex, ez] = shift(cellCentre(maze, maze.exitCol, exitRow))
  waypoints.push([ex, ez - MAZE_PITCH])
  const first = waypoints[0]!
  const yawDeg = (Math.atan2(-first[0], -first[1]) * 180) / Math.PI
  const boxes: CourseBox[] = maze.walls.map((w) => ({ at: shift(w.at), size: w.size, yawDeg: 0 }))
  let startYaw = Math.round(yawDeg)
  if (advStyle === 1) {
    // face the OPEN perpendicular side of the start cell; the 90 deg start swing (turning circle ~10 m radius) crosses into the
    // faced neighbour cell and on toward the chain's direction, so that cell must be open both ways - otherwise the task is not
    // drivable at any speed. A start cell without such a side keeps the canonical heading, so every chain of the setup fails the
    // lateralFirstLeg acceptance filter and the adversarial seed scan skips it.
    const r0 = MAZE_CELLS - 1
    // the canonical route's first step (east / west / north; the start row has no south exit)
    const dx = first[0]! > 8 ? 1 : first[0]! < -8 ? -1 : 0
    const dz = first[1]! < -8 ? -1 : 0
    const openToward = (cc: number, cr: number): boolean =>
      dz < 0 ? !maze.hWall[cr]![cc] : dx > 0 ? !maze.vWall[cr]![cc + 1] : dx < 0 ? !maze.vWall[cr]![cc] : false
    const facesOpenSide = (yaw: number): boolean => {
      const d: V2 = [-Math.sin((yaw * Math.PI) / 180), -Math.cos((yaw * Math.PI) / 180)]
      if (d[0] < -0.5) return !maze.vWall[r0]![startCol] && openToward(startCol - 1, r0) // west
      if (d[0] > 0.5) return !maze.vWall[r0]![startCol + 1] && openToward(startCol + 1, r0) // east
      if (d[1] < -0.5) return !maze.hWall[r0]![startCol] && openToward(startCol, r0 - 1) // north
      return false // south: the perimeter wall of the south start row
    }
    const plus = startYaw + 90
    const minus = startYaw - 90
    if (facesOpenSide(plus)) startYaw = plus
    else if (facesOpenSide(minus)) startYaw = minus
  }
  return { boxes, waypoints, startYawDeg: startYaw }
}

// --- crux (2nd generation, 2026-10-12 v3nose failure analysis: many tiny worlds, one crux each) --------------------------------------------------

/** number of crux failure classes (NC1 / NC2); the class of a crux seed is `(seed - 1) % CRUX_CLASSES` */
export const CRUX_CLASSES = 2
/**
 * Failure class of a crux seed, fixed by `(seed - 1) % CRUX_CLASSES` (the standard bands start at seeds 1 / 1001, so both
 * classes are covered evenly): 0 = NC1 fast corner, 1 = NC2 start swing. `layout.cls` carries the same number.
 *  - NC1 (cls 0) is the dominant v3nose maze failure (14 of 17): on leg 0 the car does not brake / steer enough for the
 *    first 90 deg turn at 17-22 m/s and overshoots offcourse - no wall contact, the forward ray leaves the corridor,
 *    bearing error to the aim ~-48 deg (a directional bias).
 *  - NC2 (cls 1) is the start-swing family: the ~90 deg swing off the start is taken too sharply and the car skids sideways
 *    into the wall (the M1 holdout crash: slip angle ~76 deg, ~0.6 m/s at the end, cone ray ~4.2 m one second before; the
 *    M2 lateral starts fail the same swing offcourse).
 */
export const cruxClass = (seed: number): number => (seed - 1) % CRUX_CLASSES
/**
 * Embodiment of the class, fixed by the seed: `floor((seed - 1) / CRUX_CLASSES) % 2` - consecutive seeds of the SAME class
 * alternate the embodiment, so every standard band shows BOTH embodiments of BOTH classes. NC1: 0 = OCCLUDED (an occluder
 * stub hides the exit until the car is close, like the old C1), 1 = OPEN (the corner fully visible - the pure speed /
 * braking failure). NC2: 0 = LATERAL start (the chains carry offM 16, cruxChains.ts), 1 = CORNER-EXIT start (the M1 crash
 * geometry: aimed at a dead-end wall, the only exit to the side). `layout.emb` carries the same number.
 */
export const cruxEmb = (seed: number): 0 | 1 => ((Math.floor((seed - 1) / CRUX_CLASSES) % 2) as 0 | 1)
/**
 * Turn direction of the mirrored crux worlds, fixed by the seed (`floor((seed - 1) / (2 * CRUX_CLASSES)) % 2`): blocks of
 * four seeds alternate, so every standard band meets BOTH turn directions of every class + embodiment combination evenly -
 * the leg-0 bearing-error sign bias of the v3nose run (measured: it fails the west-exit fast corners and drives the
 * east-exit ones) cannot survive the band. -1 = exit west, +1 = exit east.
 */
export const cruxDir = (seed: number): -1 | 1 => (((Math.floor((seed - 1) / (2 * CRUX_CLASSES)) % 2) * 2 - 1) as -1 | 1)
/** wall thickness of the crux worlds (m) */
const CRUX_T = 2
/**
 * NC2 lateral-start gate distance (m): the entry gate stands this far off the start. Same lesson as the adversarial M2 setup
 * (maze:4008): the standard maze band's lateral start legs at offM 6 are structurally unsolvable (the ~90 deg start swing
 * needs up to ~12 m of lateral room), so the NC2 lateral chains carry offM 16 (cruxChains.ts) AND the gate keeps its
 * distance so the swing fits geometrically.
 */
export const CRUX_GATE_M = 16

/** axis-aligned wall box given by its full outer extent (x0..x1 across, z0..z1 along) */
const cruxWall = (x0: number, x1: number, z0: number, z1: number): CourseBox => ({
  at: [(x0 + x1) / 2, (z0 + z1) / 2],
  size: [Math.abs(x1 - x0), Math.abs(z1 - z0)],
  yawDeg: 0,
})

/**
 * NC1 fast corner (the dominant v3nose maze failure, 14 of 17): a straight approach (`approach` 20-45 m long, `w` 10-14 m
 * wide - long enough to build the failure speeds) into a 90 deg turn to the exit corridor (`w2` wide, the goal
 * `exit` - 3.5 m in: a few m of exit before the end wall). The space PAST the corner stays OPEN (no dead-end wall): an
 * under-braked car shoots out of the corridor and ends offcourse at speed with no wall contact - exactly the maze signature
 * (overshoot offcourse, forward ray inf). Embodiments: OCCLUDED (emb 0) adds the occluder stub on the approach's exit side
 * so the exit hides until the car is close (like the old C1 - its approach / exit seed the NARROW end of the class range,
 * only there does the stub hide the carrot of a fast approach); OPEN (emb 1) leaves the corner fully visible - the pure
 * speed / braking failure. Mirrored in x (`dir`) so the leg-0 bearing-error sign bias of the v3nose run cannot survive.
 * Built with the exit toward -X; `dir` names the exit side after the mirror.
 */
function cruxNC1Course(rng: Rng, emb: 0 | 1, dir: -1 | 1): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  const t = CRUX_T
  // the OCCLUDED embodiment keeps the approach / exit narrow enough that the stub actually hides the exit from a fast
  // approach (the sight line to the carrot stays north of the mouth); the OPEN embodiment seeds the full class range
  const w = emb === 0 ? range(rng, 10, 12) : range(rng, 10, 14) // the approach corridor's width
  const approach = range(rng, 20, 45) // the straight approach before the corner
  const w2 = emb === 0 ? range(rng, 9, 10) : range(rng, 9, 12) // the exit corridor's width
  const exit = range(rng, 12, 20) // the corner -> the exit's end wall
  const boxes: CourseBox[] = [
    cruxWall(-w / 2 - t, w / 2 + t, 6, 6 + t), // back wall behind the start
    cruxWall(w / 2, w / 2 + t, -approach - w2 / 2, 6 + t), // the approach's far side wall
    cruxWall(-exit - t, -w / 2 - t, -approach + w2 / 2, -approach + w2 / 2 + t), // the exit corridor's near-side wall
    cruxWall(-exit - t, -w / 2 - t, -approach - w2 / 2 - t, -approach - w2 / 2), // the exit corridor's far-side wall
    cruxWall(-exit - t, -exit, -approach - w2 / 2 - t, -approach + w2 / 2 + t), // the exit's end wall
    // the OCCLUDED embodiment's occluder stub: seals the approach's exit side above the mouth
    ...(emb === 0 ? [cruxWall(-w / 2 - t, -w / 2, -approach + w2 / 2, 6 + t)] : []),
  ]
  const waypoints: V2[] = [
    [0, -approach],
    [-(exit - 3.5), -approach], // the goal keeps CLEARANCE.crux.min of the end wall even under chain jitter
  ]
  const flip = (p: V2): V2 => [-dir * p[0], p[1]] // as built the exit runs west; `dir` names the exit side after the mirror
  return {
    boxes: boxes.map((b) => ({ ...b, at: [-dir * b.at[0], b.at[1]] })),
    waypoints: waypoints.map(flip),
    layout: { cls: 0, emb, w, approach, w2, exit, dir },
  }
}

/**
 * NC2 CORNER-EXIT start (embodiment 1, the M1 crash geometry - the v3nose holdout maze:1040~1 slide: the ~90 deg swing at
 * 16+ m/s is taken too sharply at the end of a hard brake, slip ~76 deg, the car skids sideways into the wall at ~0.6 m/s,
 * cone ray ~4.2 m one second before): the car starts aimed straight at the dead-end wall that seals the pocket and builds
 * speed on the straight run-up (`run` 24-40 m, long enough to arrive at the failure speeds) AT it; the ONLY exit is the
 * mouth (`mw` 5.5-7.5 m, TIGHT) in one side wall at the end of the run-up, with the dead-end wall only `under` 1-3 m below
 * the mouth's bottom edge. The ~90 deg swing separates the drivers by ARRIVAL SPEED: the pure-pursuit baseline only
 * reaches ~7.5 m/s over the run-up and its preview swing fits the tight mouth, while a speed-blind net arrives at 16+ m/s,
 * cannot bend its ~10-12 m turning circle into the mouth in 8 m of carrot preview, swings wide and slides down into the
 * dead-end wall (the M1 slide). The goal sits at the end of the exit stub (`exit` 8-14 m), the M1 corner-exit chain end.
 * Mirrored in x (`dir`). Built with the exit toward -X; `dir` names the exit side after the mirror.
 */
function cruxPocketCourse(rng: Rng, dir: -1 | 1): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  const t = CRUX_T
  const pw = range(rng, 12, 16) // the pocket's width (across the start heading)
  const run = range(rng, 16, 24) // the straight run-up before the swing (the car arrives at the failure speeds)
  const mw = range(rng, 6.5, 8) // the exit mouth's width (tight: only a slow preview swing fits)
  const under = range(rng, 0.5, 1.5) // the dead-end wall's gap below the mouth's bottom edge (a sliding swing drops straight into it)
  const exit = range(rng, 8, 14) // the mouth -> the exit's end wall
  const zc = -run // the swing point / exit corridor centre line
  const dead = zc - mw / 2 - under // the dead-end wall's inner face
  const boxes: CourseBox[] = [
    cruxWall(-pw / 2 - t, pw / 2 + t, 6, 6 + t), // back wall behind the start
    cruxWall(pw / 2, pw / 2 + t, dead - t, 6 + t), // the pocket's far side wall
    cruxWall(-pw / 2 - exit - t, pw / 2 + t, dead - t, dead), // the dead-end wall (extends west under the exit as its far side)
    cruxWall(-pw / 2 - t, -pw / 2, zc + mw / 2, 6 + t), // the pocket's exit side wall above the mouth
    cruxWall(-pw / 2 - exit - t, -pw / 2 - t, zc + mw / 2, zc + mw / 2 + t), // the exit corridor's near-side wall
    cruxWall(-pw / 2 - exit - t, -pw / 2 - exit, dead - t, zc + mw / 2 + t), // the exit's end wall
  ]
  const waypoints: V2[] = [
    [0, zc], // straight down the pocket to the swing point at the mouth, then the ~90 deg swing
    [-(pw / 2 + exit - 3.5), zc], // the goal keeps CLEARANCE.crux.min of the end wall even under chain jitter
  ]
  const flip = (p: V2): V2 => [-dir * p[0], p[1]]
  return {
    boxes: boxes.map((b) => ({ ...b, at: [-dir * b.at[0], b.at[1]] })),
    waypoints: waypoints.map(flip),
    layout: { cls: 1, emb: 1, pw, run, mw, under, exit, dir },
  }
}

/**
 * NC2 LATERAL start (embodiment 0 - the M2 lesson): the chain's first leg runs ~75-80 deg off the start heading (its end
 * sits ~8-16 m off the start heading) toward a gap flanked by wall stubs at CRUX_GATE_M lateral distance. The gap centre
 * sits 6-10 m SOUTH of the start plane: that is where the ~90 deg start swing's arc (turning circle ~10 m radius) crosses
 * the gate line, so the baseline can actually drive it (the standard band's lateral start legs at offM 6 are structurally
 * unsolvable; the NC2 lateral chains carry offM 16 AND the gate keeps its distance). Mirrored in x (`dir`). Built with the
 * gate toward +X; mirrored in x for `dir = -1`.
 */
function cruxLateralCourse(rng: Rng, dir: -1 | 1): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  const t = CRUX_T
  const gw = range(rng, 9, 12) // the entry gap's width
  const zg = range(rng, -13, -9) // the gap's centre z (where the start swing's arc crosses the gate line, ~8-14 m south)
  const preX = range(rng, 10, 12) // the first leg's end (mostly lateral, ~75-80 deg off the start heading)
  const preZ = range(rng, -3.5, -1.5)
  const lenN = range(rng, 8, 14) // the north stub's length above the gap
  const lenS = range(rng, 10, 18) // the south stub's length below the gap
  const exit = range(rng, 18, 26) // the goal leg's length past the gate
  const gx = CRUX_GATE_M
  const boxes: CourseBox[] = [
    cruxWall(gx, gx + t, zg + gw / 2, zg + gw / 2 + lenN), // the north stub flanking the gap
    cruxWall(gx, gx + t, zg - gw / 2 - lenS, zg - gw / 2), // the south stub flanking the gap
  ]
  const waypoints: V2[] = [
    [preX, preZ],
    [gx, zg],
    [gx + exit, zg],
  ]
  const flip = (p: V2): V2 => [dir * p[0], p[1]]
  return {
    boxes: boxes.map((b) => ({ ...b, at: [dir * b.at[0], b.at[1]] })),
    waypoints: waypoints.map(flip),
    layout: { cls: 1, emb: 0, gate: gx, gw, zg, preX, preZ, lenN, lenS, exit, dir },
  }
}

/**
 * `crux` (v3 setup kind): MANY TINY worlds, each holding exactly ONE crux of the v3nose failure analysis. The class is
 * fixed by the seed (`cruxClass`), the embodiment within the class by `cruxEmb`, the parameters within the embodiment are
 * seeded:
 *  - NC1 (cls 0) fast corner: see `cruxNC1Course` - a 20-45 m approach into a 90 deg turn with the overshoot space past
 *    the corner OPEN (an under-braked car ends offcourse at speed, the maze signature); emb 0 OCCLUDED (the exit hidden
 *    until close, like the old C1), emb 1 OPEN (the pure speed / braking failure).
 *  - NC2 (cls 1) start swing: emb 0 LATERAL start: see `cruxLateralCourse` (chains carry offM 16, the M2 lesson);
 *    emb 1 CORNER-EXIT start: see `cruxPocketCourse` (the M1 crash geometry: aimed at a dead-end wall, only exit to the
 *    side - a too-sharp swing slides into the wall).
 */
function cruxCourse(rng: Rng, cls: number, emb: 0 | 1, dir: -1 | 1): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  if (cls === 0) return cruxNC1Course(rng, emb, dir)
  return emb === 0 ? cruxLateralCourse(rng, dir) : cruxPocketCourse(rng, dir)
}


/** Start jitter per kind: lateral (x) and longitudinal (z) offset in m, heading in degrees. Maze corridors are narrow (15 m), so small. */
const START_JITTER: Record<CourseKind, { x: number; z: number; yawDeg: number }> = {
  field: { x: 6, z: 0, yawDeg: 25 },
  slalom: { x: 5, z: 0, yawDeg: 25 },
  maze: { x: 2, z: 2, yawDeg: 20 },
  crowd: { x: 6, z: 0, yawDeg: 25 },
  free: { x: 15, z: 15, yawDeg: 90 },
  bay: { x: 3, z: 3, yawDeg: 12 },
  corridor: { x: 2, z: 3, yawDeg: 10 },
  grid: { x: 3, z: 3, yawDeg: 10 },
  // crux worlds are tiny and their corridors 9-14 m wide: the jitter stays small (the pursuit gate of cruxChains.ts
  // verifies every jittered start against the baseline; the NC2 lateral start swing is the most start-yaw-sensitive
  // embodiment, measured: a bigger yaw jitter rejects most of its holdout band)
  crux: { x: 1.5, z: 1.5, yawDeg: 8 },
  // widen-freeze kinds: rslalom is a 13.5-15.5 m corridor facing BACK (the yaw jitters around the 180 deg start),
  // deadend is bay-like; gates / dense corridors are wide enough for a moderate jitter
  rslalom: { x: 1, z: 1, yawDeg: 6 },
  deadend: { x: 3, z: 3, yawDeg: 12 },
  gates: { x: 4, z: 0, yawDeg: 10 },
  dense: { x: 4, z: 0, yawDeg: 10 },
  // obstacle-fluency detour kinds: wide plazas, the jitter moves the start pose but never off the
  // blocked line (the walls / block 0 cover the whole middle band the line runs in)
  blockade: { x: 4, z: 0, yawDeg: 12 },
  blocks: { x: 4, z: 0, yawDeg: 12 },
  // kturn maneuver kinds: the pocket (14-17 m) and the tee stem (12-14 m) are tight, the hall is wide but the
  // start sits 10 m off the back wall — the jitter stays small so the maneuver search keeps its room
  pocket: { x: 1.5, z: 1.5, yawDeg: 8 },
  tee: { x: 1, z: 1.5, yawDeg: 8 },
  hall: { x: 2, z: 1.5, yawDeg: 8 },
}

/** Seeded random start pose for variant >= 1; keeps the car clear of every wall / box (falls back to the canonical start). */
function jitterStart(course: Course): Course {
  const j = START_JITTER[course.kind]
  const rng = createRng((course.seed * 2246822519 + KIND_SALT[course.kind] * 3266489917 + course.variant * 668265263) >>> 0)
  const baseYaw = course.startYawDeg ?? 0
  for (let attempt = 0; attempt < 12; attempt++) {
    const at: V2 = [COURSE_START[0] + range(rng, -j.x, j.x), COURSE_START[1] + range(rng, -j.z, j.z)]
    const yaw = baseYaw + range(rng, -j.yawDeg, j.yawDeg)
    const hull = rectPoly(at[0], at[1], (yaw * Math.PI) / 180, 4, 8)
    const clear = course.boxes.every((b) => polyGap(hull, rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1])) > 0.5)
    if (clear) return { ...course, startAt: [Math.round(at[0] * 100) / 100, Math.round(at[1] * 100) / 100], startYawDeg: Math.round(yaw * 10) / 10 }
  }
  return course
}

export function buildCourse(kind: CourseKind, seed: number, variant = 0, difficulty = 1, chainSetup = false): Course {
  const rng = createRng((seed * 2654435761 + KIND_SALT[kind]) >>> 0)
  const adv = adversarialStyle(kind, seed)
  const body: Pick<Course, 'boxes' | 'waypoints'> & Partial<Pick<Course, 'layout' | 'startYawDeg'>> =
    kind === 'field'
      ? fieldCourse(rng, difficulty)
      : kind === 'slalom'
        ? chainSetup
          ? slalomIslandsCourse(rng)
          : slalomCourse(rng)
        : kind === 'crowd'
          ? crowdCourse(rng)
          : kind === 'free'
            ? freeCourse()
            : kind === 'bay'
              ? bayCourse(rng)
              : kind === 'corridor'
                ? corridorCourse(rng)
                : kind === 'grid'
                  ? gridCourse(rng, adv)
                  : kind === 'rslalom'
                    ? rslalomCourse(seed, variant)
                    : kind === 'deadend'
                      ? deadendCourse(seed, variant)
                      : kind === 'gates'
                        ? gatesCourse(seed, variant)
                        : kind === 'dense'
                          ? denseCourse(seed, variant)
                          : kind === 'blockade'
                            ? blockadeCourse(seed, variant)
                            : kind === 'blocks'
                              ? blocksCourse(seed, variant)
                              : kind === 'crux'
                                ? cruxCourse(rng, cruxClass(seed), cruxEmb(seed), cruxDir(seed))
                                : isKturnKind(kind)
                                  ? kturnCourse(kind, seed, variant)
                                  : mazeCourse(seed, rng, adv)
  let length = 0
  let prev: V2 = COURSE_START
  for (const w of body.waypoints) {
    length += Math.hypot(w[0] - prev[0], w[1] - prev[1])
    prev = w
  }
  const course: Course = { key: courseKey(kind, seed, variant, difficulty), kind, seed, length, variant, difficulty, ...body }
  // the enumerated adversarial keys (variant ADV_VARIANT) keep the canonical start pose so their pinned geometry (M2 start heading,
  // G1 strip) is exact; every other variant >= 1 - including the per-generation rotation of run-islands and standard keys - jitters
  // exactly as before
  return variant > 0 && !(adv !== undefined && variant === ADV_VARIANT) ? jitterStart(course) : course
}

/** Geometry of a v2 chain setup by setup key (`slalom` uses the island geometry, the other kinds equal `buildCourse`). */
export function buildSetupCourse(setupKey: string): Course {
  const { kind, seed, variant, difficulty } = parseCourseKey(setupKey)
  return buildCourse(kind, seed, variant, difficulty, true)
}

/**
 * Nearest distance (m) from a point to a polyline — the TRUE nearest segment (no segment hint), so it never
 * over-reports deviation. Used for deviation-from-the-original-chain metrics (episode.ts).
 */
export function polylineNearestDist(points: readonly V2[], x: number, z: number): number {
  let best = Infinity
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const len2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2))
    const d = Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz))
    if (d < best) best = d
  }
  return best === Infinity ? 0 : best
}

/** Arc-length progress of a point along the route polyline (start + waypoints), searched near a segment hint. */
export class RouteProgress {
  private readonly pts: V2[]
  private readonly cum: number[] = [0]
  private hint = 0
  best = 0
  /** distance of the last position to the route polyline (m) */
  lastDist = 0

  /** `course`: the route is the start plus its waypoints; a point array is used as the polyline as is (v2 command chains). */
  constructor(course: Course | V2[]) {
    this.pts = Array.isArray(course) ? course : [COURSE_START, ...course.waypoints]
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1]! + Math.hypot(this.pts[i]![0] - this.pts[i - 1]![0], this.pts[i]![1] - this.pts[i - 1]![1]))
  }

  /** Update with a position, returns the best (monotone) progress so far. */
  update(px: number, pz: number): number {
    const last = this.pts.length - 2
    let bestD = Infinity
    let bestS = this.best
    let bestSeg = this.hint
    for (let i = Math.max(0, this.hint - 1); i <= Math.min(last, this.hint + 2); i++) {
      const a = this.pts[i]!
      const b = this.pts[i + 1]!
      const dx = b[0] - a[0]
      const dz = b[1] - a[1]
      const len2 = dx * dx + dz * dz || 1
      const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / len2))
      const d = Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz))
      if (d < bestD) {
        bestD = d
        bestS = this.cum[i]! + t * Math.sqrt(len2)
        bestSeg = i
      }
    }
    this.hint = bestSeg
    this.lastDist = bestD
    if (bestS > this.best) this.best = bestS
    return this.best
  }
}

/** Fixed episode sets: TRAIN seeds never appear in HOLDOUT. */
export function trainCourseKeys(perKind = 6, kinds: readonly CourseKind[] = COURSE_KINDS): string[] {
  const keys: string[] = []
  for (let i = 0; i < perKind; i++) for (const k of kinds) keys.push(courseKey(k, 1 + i))
  return keys
}

/** HOLDOUT uses start variant 1 (random start pose), TRAIN keys are canonical; training generations add their own variants. */
export function holdoutCourseKeys(perKind = 6, kinds: readonly CourseKind[] = COURSE_KINDS, variant = 1): string[] {
  const keys: string[] = []
  for (let i = 0; i < perKind; i++) for (const k of kinds) keys.push(courseKey(k, 1001 + i, variant))
  return keys
}
