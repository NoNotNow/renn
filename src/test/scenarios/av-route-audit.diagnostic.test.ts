/**
 * AV stack route audit (diagnostic, opt-in): `AV_AUDIT=1 npx vitest run src/test/scenarios/av-route-audit.diagnostic.test.ts`
 * Starts the car from many poses on the parkour course and reports, per start:
 *   finish, time, path length vs. shortest obstacle-free path (grid Dijkstra), reversing segments,
 *   minimum gap to obstacles (negative = overlap), off-platform.
 * Writes agent-context/recordings/av-route-audit.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { applyAvStack } from '@/test/fixtures/avStackWorld'
import {
  buildSelfDrivingParkourWorld,
  SELF_DRIVE_PARKOUR_OBSTACLES,
  SELF_DRIVE_PARKOUR_WAYPOINTS,
} from '@/test/fixtures/selfDrivingCarWorld'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { WorldSimulator } from '@/test/helpers/worldSimulator'

type P = [number, number, number]
type Disc = { x: number; z: number; r: number }
type Rect = { x: number; z: number; hw: number; hd: number }

const OBST: { discs: Disc[]; rects: Rect[] } = { discs: [], rects: [] }
for (const o of SELF_DRIVE_PARKOUR_OBSTACLES) {
  const [x, , z] = o.position
  const s = o.shape
  if (s.type === 'box') OBST.rects.push({ x, z, hw: s.width / 2, hd: s.depth / 2 })
  else if (s.type === 'sphere' || s.type === 'cylinder' || s.type === 'cone' || s.type === 'capsule')
    OBST.discs.push({ x, z, r: s.radius })
  else if (s.type === 'pyramid') OBST.rects.push({ x, z, hw: s.baseSize / 2, hd: s.baseSize / 2 })
}

/** Distance from a point to the nearest obstacle surface (negative inside). */
function gapTo(x: number, z: number): number {
  let g = Infinity
  for (const d of OBST.discs) g = Math.min(g, Math.hypot(x - d.x, z - d.z) - d.r)
  for (const r of OBST.rects) {
    const dx = Math.max(Math.abs(x - r.x) - r.hw, 0)
    const dz = Math.max(Math.abs(z - r.z) - r.hd, 0)
    const outside = Math.hypot(dx, dz)
    const inside = Math.min(r.hw - Math.abs(x - r.x), r.hd - Math.abs(z - r.z))
    g = Math.min(g, outside > 0 ? outside : -inside)
  }
  return g
}

const X0 = -47
const X1 = 47
const Z0 = -70
const Z1 = 34
const CELL = 0.5
const NX = Math.round((X1 - X0) / CELL) + 1
const NZ = Math.round((Z1 - Z0) / CELL) + 1
const CAR_HALF_WIDTH = 1.0
const INFLATE = CAR_HALF_WIDTH + 0.5
const blocked = new Uint8Array(NX * NZ)
for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) blocked[i * NZ + j] = gapTo(X0 + i * CELL, Z0 + j * CELL) < INFLATE ? 1 : 0

/** Shortest obstacle-free distance between two points (8-neighbour grid Dijkstra, ~+3% grid overhead). */
function shortest(a: [number, number], b: [number, number]): number {
  const idx = (x: number, z: number) => [Math.round((x - X0) / CELL), Math.round((z - Z0) / CELL)] as const
  const [si, sj] = idx(a[0], a[1])
  const [ti, tj] = idx(b[0], b[1])
  const dist = new Float64Array(NX * NZ).fill(Infinity)
  const open: [number, number][] = [[0, si * NZ + sj]]
  dist[si * NZ + sj] = 0
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]]
  while (open.length) {
    let bi = 0
    for (let k = 1; k < open.length; k++) if (open[k]![0] < open[bi]![0]) bi = k
    const [d, n] = open.splice(bi, 1)[0]!
    if (d > dist[n]!) continue
    const i = Math.floor(n / NZ)
    const j = n % NZ
    if (i === ti && j === tj) return d * CELL
    for (const [di, dj, w] of dirs) {
      const ni = i + di!
      const nj = j + dj!
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue
      const nn = ni * NZ + nj
      if (blocked[nn] && !(ni === ti && nj === tj) && !(ni === si && nj === sj)) continue
      const nd = d + w!
      if (nd < dist[nn]!) {
        dist[nn] = nd
        open.push([nd, nn])
      }
    }
  }
  return Infinity
}

const WPS = SELF_DRIVE_PARKOUR_WAYPOINTS.map((w) => [w.position[0], w.position[2]] as [number, number])
const ACCEPT = 6

function referenceLength(start: [number, number]): number {
  let total = 0
  let cur = start
  for (const wp of WPS) {
    total += shortest(cur, wp)
    cur = wp
  }
  // the car only has to come within ACCEPT of each waypoint: allow that slack per leg
  return total - ACCEPT * WPS.length
}

type Start = { name: string; pos: P; yaw: number }
const YAWS: [string, number][] = [['N', 0], ['E', -Math.PI / 2], ['S', Math.PI], ['W', Math.PI / 2]]
function buildStarts(): Start[] {
  const out: Start[] = []
  const add = (x: number, z: number, yaws = YAWS) => {
    for (const [yn, yaw] of yaws) {
      if (gapTo(x, z) < 3.2) return
      out.push({ name: `(${x},${z})${yn}`, pos: [x, 0.55, z], yaw })
    }
  }
  for (const x of [-24, -12, 0, 12, 24]) for (const z of [14, 4]) add(x, z)
  for (const [x, z] of [[-10, -20], [10, -20], [-14, -36], [14, -36], [-10, -52], [10, -52]] as [number, number][]) add(x, z, [YAWS[0]!, YAWS[2]!])
  return out
}

describe.skipIf(!process.env.AV_AUDIT)('AV route audit', () => {
  it('audits routes from many starts', async () => {
    const rows: Record<string, unknown>[] = []
    const frames = Number(process.env.AV_AUDIT_FRAMES ?? 3000)
    const only = process.env.AV_AUDIT_ONLY
    for (const st of buildStarts()) {
      if (only && !st.name.includes(only)) continue
      setAgentObservationWatchActive(true)
      const world = applyAvStack(buildSelfDrivingParkourWorld({ carPosition: st.pos, carRotation: [0, st.yaw, 0] }))
      const sim = await WorldSimulator.create(world, 15)
      const start = sim.getPosition('car')
      let prev = start
      let len = 0
      let minGap = Infinity
      let reversing = false
      let reversals = 0
      let finishFrame = -1
      let offPlatform = false
      const fin = WPS[WPS.length - 1]!
      for (let f = 0; f < frames; f++) {
        sim.runFrames(1)
        const p = sim.getPosition('car')
        len += Math.hypot(p[0] - prev[0], p[2] - prev[2])
        prev = p
        if (only && f % 30 === 0) console.log(`TRACE ${st.name} f${f} [${p[0].toFixed(1)},${p[2].toFixed(1)}] v=${Math.hypot(sim.getVelocity('car')[0], sim.getVelocity('car')[2]).toFixed(1)}`)
        minGap = Math.min(minGap, gapTo(p[0], p[2]) - CAR_HALF_WIDTH)
        if (p[1] < -0.8 || Math.abs(p[0]) > 49 || p[2] < -72 || p[2] > 36) offPlatform = true
        const v = sim.getVelocity('car')
        const q = sim.getRotation('car')
        // forward = rotate (0,0,-1) by yaw-only quaternion
        const yaw = 2 * Math.atan2(q.y, q.w)
        const fwd = [-Math.sin(yaw), -Math.cos(yaw)]
        const along = v[0] * fwd[0]! + v[2] * fwd[1]!
        const rev = along < -0.5
        if (rev && !reversing) reversals++
        reversing = rev
        if (finishFrame < 0 && Math.hypot(p[0] - fin[0], p[2] - fin[1]) < ACCEPT && Math.hypot(v[0], v[2]) < 0.3) {
          finishFrame = f
          break
        }
      }
      const ref = referenceLength([start[0], start[2]])
      rows.push({
        start: st.name,
        finished: finishFrame >= 0,
        seconds: finishFrame >= 0 ? +(finishFrame / 60).toFixed(1) : null,
        pathLen: +len.toFixed(1),
        refLen: +ref.toFixed(1),
        ratio: +(len / ref).toFixed(2),
        reversals,
        minGap: +minGap.toFixed(2),
        offPlatform,
        end: sim.getPosition('car').map((n) => +n.toFixed(1)),
      })
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
    mkdirSync('agent-context/recordings', { recursive: true })
    writeFileSync('agent-context/recordings/av-route-audit.json', JSON.stringify(rows, null, 2) + '\n')
    const fmt = (r: Record<string, unknown>) =>
      `${String(r.start).padEnd(14)} fin=${r.finished ? 'Y' : 'N'} t=${String(r.seconds).padStart(5)}s len=${String(r.pathLen).padStart(6)} ref=${String(r.refLen).padStart(6)} ratio=${String(r.ratio).padStart(5)} rev=${r.reversals} gap=${String(r.minGap).padStart(5)} off=${r.offPlatform ? 'Y' : '-'}`
    console.log('AUDIT\n' + rows.map(fmt).join('\n'))
    const ok = rows.filter((r) => r.finished)
    console.log(`AUDITSUM n=${rows.length} finished=${ok.length} collisions=${rows.filter((r) => (r.minGap as number) < 0).length} off=${rows.filter((r) => r.offPlatform).length} medianRatio=${[...ok].map((r) => r.ratio as number).sort((a, b) => a - b)[Math.floor(ok.length / 2)]}`)
  }, 900_000)
})
