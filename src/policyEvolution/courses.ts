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
 *  - `crux` (v3 setup kind, chains only): a TINY world holding exactly ONE crux geometry of the 2026-10-12 stall analysis (a few hand-placed
 *    wall segments, chain length ~30-70 m); see `cruxCourse`. The class of a seed is `(seed - 1) % 5` (C1..C5), so the standard seed bands
 *    cover every class evenly.
 */
export type CourseKind = 'field' | 'slalom' | 'maze' | 'crowd' | 'free' | 'bay' | 'corridor' | 'grid' | 'crux'

/** The v1 kinds (default sets of the v1 tools). `crowd` is a v2 chain setup kind, see CHAIN_KINDS. */
export const COURSE_KINDS: readonly CourseKind[] = ['field', 'slalom', 'maze']
/** Setup kinds of the v2 command-chain training (src/policyEvolution/chains.ts). */
export const CHAIN_KINDS: readonly CourseKind[] = ['field', 'slalom', 'maze', 'crowd']
/** v3 setup kinds: `free` (big closed arena, direction chains with reversals), `bay` (dead-end bays), `corridor` (too narrow to U-turn); see spec-command-chains.md, section v3. */
export const REVERSAL_KINDS: readonly CourseKind[] = ['bay', 'corridor']
export const V3_NEW_KINDS: readonly CourseKind[] = ['free', ...REVERSAL_KINDS]
/** all v3 kinds in report order: the new free-track / reversal kinds, the v2 obstacle kinds, the grid serpentine and the crux worlds */
export const V3_KINDS: readonly CourseKind[] = [...V3_NEW_KINDS, ...CHAIN_KINDS, 'grid', 'crux']
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

export const KIND_SALT: Record<CourseKind, number> = { field: 7919, slalom: 104729, maze: 1299709, crowd: 15485863, free: 32452843, bay: 49979687, corridor: 67867967, grid: 86028121, crux: 86028157 }

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

// --- crux (2026-10-12 stall analysis: many tiny worlds, one crux each) --------------------------------------------------------------------------

/** number of crux failure classes (C1..C5); the class of a crux seed is `(seed - 1) % CRUX_CLASSES` */
export const CRUX_CLASSES = 5
/**
 * Failure class of a crux seed, fixed by `(seed - 1) % CRUX_CLASSES` (the standard bands start at seeds 1 / 1001, so every
 * class is covered evenly): 0 = C1 occluded fast corner, 1 = C2 confined corner pocket, 2 = C3 S-bend,
 * 3 = C4 lateral gate entry, 4 = C5 final corner + goal. `layout.cls` carries the same number.
 */
export const cruxClass = (seed: number): number => (seed - 1) % CRUX_CLASSES
/** wall thickness of the crux worlds (m) */
const CRUX_T = 2
/**
 * C4 start-lateral offset (m): the entry gate stands this far off the start. Same lesson as the adversarial M2 setup
 * (maze:4008): the standard maze band's lateral start legs at offM 6 are structurally unsolvable (the ~90 deg start
 * swing needs up to ~12 m of lateral room), so the crux C4 chains carry offM 16 (cruxChains.ts) AND the gate keeps
 * its distance so the swing fits geometrically.
 */
export const CRUX_GATE_M = 16

/** axis-aligned wall box given by its full outer extent (x0..x1 across, z0..z1 along) */
const cruxWall = (x0: number, x1: number, z0: number, z1: number): CourseBox => ({
  at: [(x0 + x1) / 2, (z0 + z1) / 2],
  size: [Math.abs(x1 - x0), Math.abs(z1 - z0)],
  yawDeg: 0,
})

/**
 * The corner-cell skeleton shared by C1 / C2 / C5: a straight approach into a dead-end wall across its end, with the only
 * way out a perpendicular exit corridor hugging the dead-end wall - the maze corner geometry (the wall across the cell is
 * what stalls the car, the side opening is the turn). `gap` (C2) narrows the mouth with a stub that juts out of the
 * dead-end wall, so the pocket must be taken slow or with a reverse swing; the approach behind the corner is the backing
 * room. Built with the exit toward -X; mirrored in x for `dir = 1`.
 */
function cruxCornerCourse(rng: Rng, cls: number, w: number, approach: number, w2: number, exit: number, gap?: number): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  const t = CRUX_T
  const dir: -1 | 1 = rng.next() < 0.5 ? -1 : 1
  const zCorner = -approach + w2 / 2 // the exit corridor's centre line
  const boxes: CourseBox[] = [
    cruxWall(-w / 2 - t, w / 2 + t, 6, 6 + t), // back wall behind the start
    cruxWall(w / 2, w / 2 + t, -approach - t, 6 + t), // the approach's far side wall
    cruxWall(-w / 2 - t, -w / 2, zCorner + w2 / 2, 6 + t), // the exit side wall above the mouth (the C1 occluder)
    cruxWall(-exit - t, w / 2 + t, -approach - t, -approach), // the dead-end wall across the cell
    cruxWall(-exit - t, -w / 2, zCorner + w2 / 2, zCorner + w2 / 2 + t), // the exit corridor's far-side wall
    cruxWall(-exit - t, -exit, -approach - t, zCorner + w2 / 2 + t), // the exit's end wall
  ]
  if (gap !== undefined && w2 - gap > 0.5) boxes.push(cruxWall(-w / 2 - 3, -w / 2, -approach, -approach + w2 - gap))
  const waypoints: V2[] = [
    [0, zCorner],
    [-(exit - 3.5), zCorner], // the goal keeps CLEARANCE.crux.min of the end wall even under chain jitter
  ]
  const flip = (p: V2): V2 => [-dir * p[0], p[1]] // as built the exit runs west; `dir` names the exit side after the mirror
  return {
    boxes: boxes.map((b) => ({ ...b, at: [-dir * b.at[0], b.at[1]] })),
    waypoints: waypoints.map(flip),
    layout: { cls, w, approach, w2, exit, dir, ...(gap !== undefined ? { gap } : {}) },
  }
}

/**
 * C3 S-bend: a hall whose central block (hanging from the back wall down to a middle channel) forces two ADJACENT
 * OPPOSITE 90 deg turns - down the east channel, west across the middle channel, south down the west channel. The turns
 * sit one crossing apart (the minimum the ~10 m turning circle allows), the overshoot trap of the stall analysis. The
 * pocket east of the west channel below the middle channel is the second turn's swing room (like the maze's open corner
 * cell); `pw` is its width.
 */
function cruxSBendCourse(rng: Rng): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  const t = CRUX_T
  const w = range(rng, 12, 14) // channel width
  const bw = range(rng, 2, 6) // the central block's width (the crossing's length is w + bw + w)
  const zMid = range(rng, 16, 24) // start -> the middle channel's centre line
  const leg3 = range(rng, 14, 22) // the middle channel -> the goal (southward)
  const pw = range(rng, 6, 9) // the pocket's width (the second turn's swing room)
  const xw = -(w + bw) // the west channel's centre line
  const zs = -(zMid + leg3 + 4) // the south wall's inner face (4 m past the goal)
  const xs = xw + w / 2 + pw // the south stub's west face (the pocket's east end)
  const boxes: CourseBox[] = [
    cruxWall(xw - w / 2 - t, w / 2 + t, 6, 6 + t), // back wall behind the start
    cruxWall(w / 2, w / 2 + t, zs - t, 6 + t), // east wall
    cruxWall(xw - w / 2 - t, xw - w / 2, zs - t, 6 + t), // west wall
    cruxWall(xw - w / 2 - t, w / 2 + t, zs - t, zs), // south wall
    cruxWall(-w / 2 - bw, -w / 2, -zMid + w / 2, 6 + t), // the central block, hanging from the back wall
    cruxWall(xs, w / 2 + t, zs - t, -zMid - w / 2), // the south stub, sealing the middle channel east of the pocket
  ]
  const waypoints: V2[] = [
    [0, -zMid],
    [xw, -zMid],
    [xw, -(zMid + leg3)],
  ]
  return { boxes, waypoints, layout: { cls: 2, w, bw, zMid, leg3, pw } }
}

/**
 * C4 lateral gate entry: the chain's first leg runs ~75-80 deg off the start heading (mostly lateral) toward a gap
 * flanked by wall stubs at CRUX_GATE_M lateral distance. The gap centre sits 6-10 m SOUTH of the start plane: that is
 * where the ~90 deg start swing's arc (turning circle ~10 m radius) crosses the gate line, so the baseline can actually
 * drive it (the M2 lesson: the standard band's lateral start legs at offM 6 are structurally unsolvable; the crux C4
 * chains carry offM 16 AND the gate keeps its distance). Built with the gate toward +X; mirrored in x for `dir = -1`.
 */
function cruxGateCourse(rng: Rng): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  const t = CRUX_T
  const gw = range(rng, 9, 12) // the entry gap's width
  const zg = range(rng, -13, -9) // the gap's centre z (where the start swing's arc crosses the gate line, ~8-14 m south)
  const preX = range(rng, 10, 12) // the first leg's end (mostly lateral, ~75-80 deg off the start heading)
  const preZ = range(rng, -3.5, -1.5)
  const lenN = range(rng, 8, 14) // the north stub's length above the gap
  const lenS = range(rng, 10, 18) // the south stub's length below the gap
  const exit = range(rng, 18, 26) // the goal leg's length past the gate
  const dir: -1 | 1 = rng.next() < 0.5 ? 1 : -1
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
    layout: { cls: 3, gate: gx, gw, zg, preX, preZ, lenN, lenS, exit, dir },
  }
}

/**
 * `crux` (v3 setup kind): MANY TINY worlds, each holding exactly ONE crux class of the 2026-10-12 stall analysis.
 * The class is fixed by the seed (`cruxClass`), the parameters within the class are seeded:
 *  - C1 (cls 0) occluded fast corner: a 32-50 m approach (10-11 m wide) into a 90 deg corner around a dead-end wall -
 *    the exit-side wall above the mouth OCCLUDES the carrot (look-ahead 8 + 0.6 v) for the last ~8-15 m of a fast
 *    approach (v >= ~20: the stall analysis speeds); the exit corridor (9-10 m wide) is open after the corner.
 *  - C2 (cls 1) confined corner pocket: a 20-28 m approach into a corner pocket whose mouth is narrowed by a stub out of
 *    the dead-end wall (gap 8.5-9.5 m) - taken slow or with a reverse swing; the approach behind it is the backing room.
 *  - C3 (cls 2): see `cruxSBendCourse`.
 *  - C4 (cls 3): see `cruxGateCourse` (chains carry offM 16, the M2 lesson).
 *  - C5 (cls 4) final corner + goal: a 26-34 m approach into a corner whose exit stub is only 10-16 m - the goal sits
 *    right after the last turn, 2 m before the end wall (the M1 corner-exit overshoot, mirrored: no whipping past).
 */
function cruxCourse(rng: Rng, cls: number): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  if (cls === 0) return cruxCornerCourse(rng, 0, range(rng, 10, 11), range(rng, 32, 50), range(rng, 9, 10), range(rng, 16, 24))
  if (cls === 1) return cruxCornerCourse(rng, 1, range(rng, 11, 13), range(rng, 20, 28), range(rng, 10, 11), range(rng, 14, 20), range(rng, 8.5, 9.5))
  if (cls === 2) return cruxSBendCourse(rng)
  if (cls === 3) return cruxGateCourse(rng)
  return cruxCornerCourse(rng, 4, range(rng, 12, 14), range(rng, 26, 34), range(rng, 10, 12), range(rng, 10, 16))
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
  // verifies every jittered start against the baseline; the C4 lateral swing is the most start-yaw-sensitive class,
  // measured: a bigger yaw jitter rejects most of the C4 holdout band)
  crux: { x: 1.5, z: 1.5, yawDeg: 8 },
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
                  : kind === 'crux'
                    ? cruxCourse(rng, cruxClass(seed))
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
