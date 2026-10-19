import { headingDir, polyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import { buildSetupCourse, kturnWorld, parseCourseKey, type CourseBox } from './courses'
import type { Chain } from './chains'

/**
 * The kturn maneuver-chain generator (Rangieren plan, 2026-10-19; design + critic record:
 * test-results/policy-evolution/rangieren/DESIGN-R2.md). The PLAN is the chain: a deterministic
 * A* over forward/backward arc primitives finds a multi-move turning sequence (1-/3-/5-Zug) from the
 * (jittered) start pose to each target end, and the moves become the chain LEGS (`legEnds` = the cusp
 * boundaries). The net executes the legs with the existing v3 contracts (legs.ts leg tracker, deriveCmd
 * aim points) — a reversal leg is a polyline segment that doubles back, exactly like the bay / deadend
 * back-out legs the shipped policy already drives.
 *
 * Clearance is checked on the TRUE 4x8 hull (not the planner's width inflation): every candidate arc is
 * sampled every 0.5 m in POSE space and each sampled pose's rotated rectangle (rectPoly, the same helper
 * jitterStart uses) must keep KTURN_HULL_MARGIN of polyGap to every box — corners and the nose/tail sweep
 * are included by construction. Anti-cheese / degeneracy (CRITIC-R2.md T1-T5): arc lengths are >= 4 m
 * (no zero-length moves), the visited set makes oscillation unreachable, the flip cost (FLIP_COST) prices
 * every cusp so the search prefers the fewest moves, and the chain is a pure guidance polyline — the
 * episode scores deviation from it exactly like every other kind.
 */

/** offcourse tolerance of a kturn chain (matches the reversal kinds; the maneuver swings stay near their legs) */
const OFF_KTURN_M = 8
/** the hull keeps this polyGap (m) to every box at every sampled arc pose */
const KTURN_HULL_MARGIN = 0.5

/** steering curvatures of the arc primitives (1/m; ~10-20 m radius + straight — the car's turning circle) */
const CURVATURES = [-0.1, -0.05, 0, 0.05, 0.1] as const
/** arc lengths of the primitives (m) — every move is >= 4 m by construction */
const ARC_LENS = [4, 8] as const
const SAMPLE_M = 0.5
const CHAIN_PT_M = 2
/** cost of a direction flip (m equivalent): the search prefers fewer moves */
const FLIP_COST = 10
const GOAL_M = 2.5
const QH = Math.PI / 12
const MAX_POPS = 60_000
const MAX_G = 320

/** True-hull clearance of one pose (4x8 rotated rect vs every box, >= KTURN_HULL_MARGIN polyGap). */
export function hullClearAt(boxes: CourseBox[], x: number, z: number, heading: number): boolean {
  const hull = rectPoly(x, z, heading, 4, 8)
  return boxes.every((b) => polyGap(hull, rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1])) > KTURN_HULL_MARGIN)
}

interface BoxPoly {
  poly: V2[]
  cx: number
  cz: number
  /** center distance beyond which no hull overlap is possible */
  rad: number
}

const HULL_RAD = Math.hypot(4, 8) / 2

interface Arc {
  dir: 1 | -1
  kappa: number
  len: number
  x0: number
  z0: number
  h0: number
  x1: number
  z1: number
  h1: number
}

export interface ManeuverPath {
  /** chain waypoints: start pose + every CHAIN_PT_M along the arcs */
  points: V2[]
  /** point indices where each move (leg) ends */
  legEnds: number[]
  /** number of direction flips (moves - 1) */
  flips: number
  /** travelled length (m) */
  len: number
}

/**
 * Deterministic A* from a pose to a target end over arc primitives with cusp flips. Returns null when no
 * hull-clear sequence of <= maxLenM exists (the caller then omits the chain / rejects the setup).
 */
export function maneuverSearch(boxes: CourseBox[], startX: number, startZ: number, startHeading: number, end: V2, maxLenM = MAX_G): ManeuverPath | null {
  const polys: BoxPoly[] = boxes.map((b) => {
    const poly = rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1])
    return { poly, cx: b.at[0], cz: b.at[1], rad: Math.hypot(b.size[0], b.size[1]) / 2 }
  })
  const clearAt = (x: number, z: number, h: number): boolean => {
    const hull = rectPoly(x, z, h, 4, 8)
    for (const b of polys) {
      if (Math.hypot(x - b.cx, z - b.cz) > b.rad + HULL_RAD + KTURN_HULL_MARGIN) continue
      if (polyGap(hull, b.poly) <= KTURN_HULL_MARGIN) return false
    }
    return true
  }
  if (!clearAt(startX, startZ, startHeading)) return null
  const qhOf = (h: number) => Math.round(((((h % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / QH)) % 24
  const visited = new Map<string, number>()
  interface Node {
    x: number
    z: number
    h: number
    dir: 1 | -1
    g: number
    parent: number
    arc: Arc | null // null = flip edge
  }
  const nodes: Node[] = []
  const heap: Array<{ f: number; seq: number; node: number }> = []
  const push = (f: number, seq: number, node: number) => {
    heap.push({ f, seq, node })
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p]!.f < heap[i]!.f || (heap[p]!.f === heap[i]!.f && heap[p]!.seq < heap[i]!.seq)) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]!]
      i = p
    }
  }
  const pop = (): { f: number; seq: number; node: number } | undefined => {
    if (!heap.length) return undefined
    const top = heap[0]!
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && (heap[l]!.f < heap[m]!.f || (heap[l]!.f === heap[m]!.f && heap[l]!.seq < heap[m]!.seq))) m = l
        if (r < heap.length && (heap[r]!.f < heap[m]!.f || (heap[r]!.f === heap[m]!.f && heap[r]!.seq < heap[m]!.seq))) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]!]
        i = m
      }
    }
    return top
  }
  const start = { x: startX, z: startZ, h: startHeading, dir: 1 as 1 | -1, g: 0, parent: -1, arc: null }
  nodes.push(start)
  let seq = 0
  const hEnd = Math.hypot(startX - end[0], startZ - end[1])
  push(hEnd, seq++, 0)
  visited.set(`${Math.round(startX)}|${Math.round(startZ)}|${qhOf(startHeading)}|1`, 0)
  let pops = 0
  for (;;) {
    const top = pop()
    if (!top) return null
    pops++
    if (pops > MAX_POPS) return null
    const n = nodes[top.node]!
    if (Math.hypot(n.x - end[0], n.z - end[1]) <= GOAL_M) {
      // reconstruct: walk parents, collect arcs (reverse), rebuild the polyline + cusp boundaries
      const arcs: Arc[] = []
      let cur = top.node
      for (;;) {
        const nd = nodes[cur]!
        if (nd.arc) arcs.push(nd.arc)
        if (nd.parent < 0) break
        cur = nd.parent
      }
      arcs.reverse()
      const points: V2[] = [[startX, startZ]]
      const legEnds: number[] = []
      let prevDir: 1 | -1 | null = null
      let len = 0
      for (const a of arcs) {
        if (prevDir !== null && a.dir !== prevDir) legEnds.push(points.length - 1)
        prevDir = a.dir
        len += a.len
        const steps = Math.round(a.len / SAMPLE_M)
        const emit = Math.max(1, Math.round(CHAIN_PT_M / SAMPLE_M))
        for (let i = 1; i <= steps; i++) {
          if (i % emit !== 0 && i !== steps) continue
          const { x, z } = arcPose(a, i * SAMPLE_M)
          const last = points[points.length - 1]!
          if (Math.hypot(x - last[0], z - last[1]) < 0.05) continue
          points.push([x, z])
        }
      }
      legEnds.push(points.length - 1)
      return { points, legEnds, flips: legEnds.length - 1, len }
    }
    // flip edge: same pose, opposite direction
    const flipG = n.g + FLIP_COST
    if (flipG <= maxLenM) {
      const fkey = `${Math.round(n.x)}|${Math.round(n.z)}|${qhOf(n.h)}|${n.dir === 1 ? -1 : 1}`
      if (!(visited.get(fkey) !== undefined && visited.get(fkey)! <= flipG)) {
        visited.set(fkey, flipG)
        nodes.push({ x: n.x, z: n.z, h: n.h, dir: n.dir === 1 ? -1 : 1, g: flipG, parent: top.node, arc: null })
        push(flipG + Math.hypot(n.x - end[0], n.z - end[1]), seq++, nodes.length - 1)
      }
    }
    // arc edges
    for (const kappa of CURVATURES) {
      for (const len of ARC_LENS) {
        const g = n.g + len
        if (g > maxLenM) continue
        const dir = n.dir
        const arc: Arc = { dir, kappa, len, x0: n.x, z0: n.z, h0: n.h, x1: 0, z1: 0, h1: 0 }
        let ok = true
        const steps = Math.round(len / SAMPLE_M)
        for (let i = 1; i <= steps && ok; i++) {
          const p = arcPose(arc, i * SAMPLE_M)
          if (!clearAt(p.x, p.z, p.h)) ok = false
        }
        if (!ok) continue
        const p1 = arcPose(arc, len)
        arc.x1 = p1.x
        arc.z1 = p1.z
        arc.h1 = p1.h
        const key = `${Math.round(arc.x1)}|${Math.round(arc.z1)}|${qhOf(arc.h1)}|${dir}`
        if (visited.get(key) !== undefined && visited.get(key)! <= g) continue
        visited.set(key, g)
        nodes.push({ x: arc.x1, z: arc.z1, h: arc.h1, dir, g, parent: top.node, arc })
        push(g + Math.hypot(arc.x1 - end[0], arc.z1 - end[1]), seq++, nodes.length - 1)
      }
    }
  }
}

/** pose along an arc at travelled distance s (0..len), forward or reverse bicycle step. */
function arcPose(a: Arc, s: number): { x: number; z: number; h: number } {
  const ds = a.dir * s
  const hm = a.h0 + (a.kappa * ds) / 2
  const d = headingDir(hm)
  return { x: a.x0 + d[0] * ds, z: a.z0 + d[1] * ds, h: a.h0 + a.kappa * ds }
}

function toChain(points: V2[], legEnds: number[], endIndex: number, offM: number): Chain {
  let length = 0
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1])
  return { points, length, endIndex, legEnds, offM }
}

/**
 * Chains of a kturn setup (one per target end, in end order): the maneuver search plans the multi-move
 * turning sequence from the (jittered) start pose to every end; an end with no hull-clear sequence is
 * skipped, and a setup with fewer than the minimum chains is rejected by the band enumeration.
 */
export function generateKturnChains(setupKey: string): Chain[] {
  const { kind, seed, variant } = parseCourseKey(setupKey)
  const world = kturnWorld(kind, seed, variant)
  const course = buildSetupCourse(setupKey)
  const start: V2 = course.startAt ?? [0, 0]
  const h0 = ((course.startYawDeg ?? 0) * Math.PI) / 180
  const chains: Chain[] = []
  world.ends.forEach((end, i) => {
    const path = maneuverSearch(world.boxes, start[0], start[1], h0, end)
    if (path && path.points.length >= 2) chains.push(toChain(path.points, path.legEnds, i, OFF_KTURN_M))
  })
  return chains
}
