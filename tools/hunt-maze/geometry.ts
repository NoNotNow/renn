/**
 * Labyrinth geometry of a hunt world, computed from the wall entities (`wall_maze_<X>_*`): bbox, clearance grid,
 * geodesic distance to the outside, deep start cells, the gate on the shortest way out and a goal point beyond it.
 * Pure (no fs): takes the loaded RennWorld.
 */
import type { RennWorld } from '@/types/world'

export type V2 = [number, number]
export interface Box { cx: number; cz: number; hw: number; hd: number; c: number; s: number }
export interface Circle { cx: number; cz: number; r: number }

/** Distance from (x,z) to a yawed box (0 inside). Box frame: local x = dx*cos - dz*sin, local z = dx*sin + dz*cos (yaw = entity rotation[1]). */
export function boxDist(b: Box, x: number, z: number): number {
  const dx = x - b.cx
  const dz = z - b.cz
  const lx = Math.abs(dx * b.c - dz * b.s)
  const lz = Math.abs(dx * b.s + dz * b.c)
  return Math.hypot(Math.max(0, lx - b.hw), Math.max(0, lz - b.hd))
}

export interface Obstacles { boxes: Box[]; circles: Circle[] }

type E = { id: string; bodyType?: string; shape?: { type: string; width?: number; depth?: number; radius?: number }; position: number[]; rotation: number[] }

/** Static boxes/cylinders of the world plus (conservative, r = 6) dynamic clutter that is not a car. */
export function collectObstacles(world: RennWorld): Obstacles {
  const boxes: Box[] = []
  const circles: Circle[] = []
  for (const e of world.entities as unknown as (E & { transformerPipeStack?: unknown[] })[]) {
    if (!e.shape || e.shape.type === 'plane') continue
    if (e.bodyType === 'static') {
      if (e.shape.type === 'box') {
        const yaw = e.rotation[1] ?? 0
        boxes.push({ cx: e.position[0]!, cz: e.position[2]!, hw: (e.shape.width ?? 1) / 2, hd: (e.shape.depth ?? 1) / 2, c: Math.cos(yaw), s: Math.sin(yaw) })
      } else circles.push({ cx: e.position[0]!, cz: e.position[2]!, r: e.shape.radius ?? 2 })
    } else if (e.bodyType === 'dynamic' && !e.transformerPipeStack?.length) circles.push({ cx: e.position[0]!, cz: e.position[2]!, r: 6 })
  }
  return { boxes, circles }
}

export function clearanceAt(o: Obstacles, x: number, z: number, limit = 60): number {
  let m = limit
  for (const b of o.boxes) {
    const reach = limit + Math.max(b.hw, b.hd) * 1.5
    if (Math.abs(b.cx - x) > reach || Math.abs(b.cz - z) > reach) continue
    m = Math.min(m, boxDist(b, x, z))
  }
  for (const c of o.circles) m = Math.min(m, Math.hypot(c.cx - x, c.cz - z) - c.r)
  return m
}

export type BBox = [number, number, number, number] // x0 x1 z0 z1

export interface StartCell { x: number; z: number; yawDeg: number; depthM: number; gate: V2; goal: V2; role: string }
export interface MazeInfo { id: string; bbox: BBox; nWalls: number; starts: StartCell[]; maxDepthM: number }

export const NAV_CLEARANCE = 3.2 // cells the 4x8 m car can drive through (half-width 2 + margin)
export const START_CLEARANCE = 5.5
export const OUT_MARGIN = 5
export const GOAL_BEYOND = 30

const NB: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]]

class Heap {
  private a: [number, number][] = []
  push(k: number, v: number) {
    const a = this.a
    a.push([k, v])
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p]![0] <= a[i]![0]) break
      ;[a[p], a[i]] = [a[i]!, a[p]!]
      i = p
    }
  }
  pop(): [number, number] | undefined {
    const a = this.a
    if (!a.length) return undefined
    const top = a[0]!
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l]![0] < a[m]![0]) m = l
        if (r < a.length && a[r]![0] < a[m]![0]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i]!, a[m]!]
        i = m
      }
    }
    return top
  }
}

export function mazeIds(world: RennWorld): string[] {
  const ids = new Set<string>()
  for (const e of world.entities) {
    const m = /^wall_maze_([A-Za-z0-9]+)_/.exec(e.id)
    if (m) ids.add(m[1]!)
  }
  return [...ids].sort()
}

export function mazeBBox(world: RennWorld, id: string): { bbox: BBox; n: number } {
  const b: BBox = [1e9, -1e9, 1e9, -1e9]
  let n = 0
  for (const e of world.entities as unknown as E[]) {
    if (!e.id.startsWith(`wall_maze_${id}_`) || e.shape?.type !== 'box') continue
    n++
    const yaw = e.rotation[1] ?? 0
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const lx = (sx * (e.shape.width ?? 1)) / 2
      const lz = (sz * (e.shape.depth ?? 1)) / 2
      // inverse of the box frame above: world = centre + lx*(c, -s) + lz*(s, c)
      const x = e.position[0]! + lx * c + lz * s
      const z = e.position[2]! - lx * s + lz * c
      b[0] = Math.min(b[0], x); b[1] = Math.max(b[1], x); b[2] = Math.min(b[2], z); b[3] = Math.max(b[3], z)
    }
  }
  return { bbox: b, n }
}

export const insideBBox = (b: BBox, x: number, z: number, margin = 0) => x > b[0] - margin && x < b[1] + margin && z > b[2] - margin && z < b[3] + margin

/** Yaw (deg, entity rotation[1]) of a car that faces direction (fx, fz): forward = (-sin yaw, -cos yaw). */
export const yawDegFacing = (fx: number, fz: number) => Math.round((Math.atan2(-fx, -fz) * 180) / Math.PI)

/** Options for an alternative (held-out) start set: starts >= avoidR m from every `avoid` point, shallower depth floor, rotated yaw roles. */
export interface StartOpts { avoid?: V2[]; avoidR?: number; floorFrac?: number; roleShift?: number }

export function analyseMaze(world: RennWorld, id: string, obs: Obstacles, nStarts = 3, so: StartOpts = {}): MazeInfo {
  const { bbox, n } = mazeBBox(world, id)
  const pad = 45
  const x0 = Math.floor(bbox[0]) - pad
  const z0 = Math.floor(bbox[2]) - pad
  const W = Math.ceil(bbox[1] - bbox[0]) + 2 * pad
  const H = Math.ceil(bbox[3] - bbox[2]) + 2 * pad
  const idx = (i: number, j: number) => j * W + i
  const clr = new Float32Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) clr[idx(i, j)] = clearanceAt(obs, x0 + i + 0.5, z0 + j + 0.5)
  const outside = (i: number, j: number) => !insideBBox(bbox, x0 + i + 0.5, z0 + j + 0.5)
  const dist = new Float32Array(W * H).fill(Infinity)
  const parent = new Int32Array(W * H).fill(-1)
  const heap = new Heap()
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (outside(i, j) && clr[idx(i, j)]! >= NAV_CLEARANCE) { dist[idx(i, j)] = 0; heap.push(0, idx(i, j)) }
  for (let it = heap.pop(); it; it = heap.pop()) {
    const [d, k] = it
    if (d > dist[k]!) continue
    const i = k % W
    const j = (k - i) / W
    for (const [di, dj, w] of NB) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue
      const nk = idx(ni, nj)
      if (clr[nk]! < NAV_CLEARANCE) continue
      if (di !== 0 && dj !== 0 && (clr[idx(i + di, j)]! < NAV_CLEARANCE || clr[idx(i, j + dj)]! < NAV_CLEARANCE)) continue
      if (d + w < dist[nk]!) { dist[nk] = d + w; parent[nk] = k; heap.push(d + w, nk) }
    }
  }
  // candidate starts: roomy interior cells, deepest first, spread >= 25 m apart
  const cand: { k: number; d: number }[] = []
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = idx(i, j)
    if (outside(i, j) || !Number.isFinite(dist[k]!) || clr[k]! < START_CLEARANCE) continue
    if (!insideBBox(bbox, x0 + i + 0.5, z0 + j + 0.5, -6)) continue
    cand.push({ k, d: dist[k]! })
  }
  cand.sort((a, b) => b.d - a.d || a.k - b.k)
  const maxDepthM = cand[0]?.d ?? 0
  const chosen: { k: number; d: number }[] = []
  const floorD = maxDepthM * (so.floorFrac ?? 0.5)
  for (const c of cand) {
    if (c.d < floorD || chosen.length >= nStarts) break
    const ci = c.k % W
    const cj = (c.k - ci) / W
    if (so.avoid?.some((a) => Math.hypot(a[0] - (x0 + ci + 0.5), a[1] - (z0 + cj + 0.5)) < (so.avoidR ?? 12))) continue
    if (chosen.every((o) => Math.hypot((o.k % W) - ci, Math.floor(o.k / W) - cj) >= 25)) chosen.push(c)
  }
  const roles = ['toward-exit', 'away-from-exit', 'sideways']
  const starts: StartCell[] = chosen.map((c, n2i) => {
    const n2 = n2i + (so.roleShift ?? 0)
    // backtrack to the first outside cell: gate = last interior cell, direction of the first 12 m of the route for the yaw
    let k = c.k
    let gate = k
    const path: number[] = [k]
    while (parent[k]! >= 0) {
      const i = k % W
      const j = (k - i) / W
      if (outside(i, j)) break
      gate = k
      k = parent[k]!
      path.push(k)
    }
    const at = (kk: number): V2 => [x0 + (kk % W) + 0.5, z0 + Math.floor(kk / W) + 0.5]
    const p0 = at(c.k)
    const pAhead = at(path[Math.min(path.length - 1, 12)]!)
    let fx = pAhead[0] - p0[0]
    let fz = pAhead[1] - p0[1]
    if (n2 % 3 === 1) { fx = -fx; fz = -fz } else if (n2 % 3 === 2) { const t = fx; fx = -fz; fz = t }
    const g = at(gate)
    // outward normal = nearest bbox side of the gate cell
    const sides: [number, V2][] = [[g[0] - bbox[0], [-1, 0]], [bbox[1] - g[0], [1, 0]], [g[1] - bbox[2], [0, -1]], [bbox[3] - g[1], [0, 1]]]
    sides.sort((a, b) => a[0] - b[0])
    const [edgeD, nrm] = sides[0]!
    let goal: V2 = [g[0] + nrm[0] * (edgeD + GOAL_BEYOND), g[1] + nrm[1] * (edgeD + GOAL_BEYOND)]
    for (const beyond of [GOAL_BEYOND, 35, 40, 25]) {
      const cand2: V2 = [g[0] + nrm[0] * (edgeD + beyond), g[1] + nrm[1] * (edgeD + beyond)]
      if (clearanceAt(obs, cand2[0], cand2[1]) >= 10) { goal = cand2; break }
    }
    return { x: Math.round(p0[0] * 10) / 10, z: Math.round(p0[1] * 10) / 10, yawDeg: yawDegFacing(fx, fz), depthM: Math.round(c.d), gate: [Math.round(g[0]), Math.round(g[1])], goal: [Math.round(goal[0]), Math.round(goal[1])], role: roles[n2 % 3]! }
  })
  return { id, bbox: bbox.map((v) => Math.round(v * 10) / 10) as BBox, nWalls: n, starts, maxDepthM: Math.round(maxDepthM) }
}
