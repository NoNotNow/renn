/**
 * Example world `self_hunt_flexible`: pack cars carry their pipeline once, the world has no referee/score/tint/beacon
 * leftovers, the labyrinth walls (`wall_*`) do not swallow any spawn, and the world simulates headless without errors.
 * See agent-context/example-worlds.md (self_hunt_flexible).
 *
 *   HUNT_FRAMES=3600 npx vitest run src/test/scenarios/hunt-game.integration.test.ts
 */
import { describe, expect, it } from 'vitest'
import { loadLabWorld } from '@/test/avLab/lab'
import { installDeterminism } from '@/test/avLab/determinism'
import { WorldSimulator } from '@/test/helpers/worldSimulator'

const AV = 'entity_1779823253285_brtkx1p'
const AV_PIPE = 'global_av_autopilot'
const FRAMES = Number(process.env.HUNT_FRAMES ?? 600)
const CAR_CLEARANCE = 15
const PROP_CLEARANCE = 4

type Ent = ReturnType<typeof loadLabWorld>['entities'][number]
const isWall = (e: Ent) => e.id.startsWith('wall_')
const isCar = (e: Ent) => e.id === AV || (e.transformerPipeStack?.length ?? 0) > 0 || e.id === 'entity_1780566414550_ju2ejzl'

type V3 = [number, number, number]
type Obb = { c: V3; h: V3; R: number[][] }
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const colOf = (R: number[][], i: number): V3 => [R[0][i], R[1][i], R[2][i]]

/** Conservative box (half extents + three.js XYZ Euler rotation) around any shape; round shapes use their bounding box. */
function obbOf(e: Ent, margin = 0): Obb {
  const s = (e.scale as number[] | undefined) ?? [1, 1, 1]
  const sh = e.shape as Record<string, number> & { type: string }
  let h: V3
  switch (sh.type) {
    case 'box': h = [(sh.width * s[0]) / 2, (sh.height * s[1]) / 2, (sh.depth * s[2]) / 2]; break
    case 'sphere': h = [sh.radius * s[0], sh.radius * s[0], sh.radius * s[0]]; break
    case 'cylinder':
    case 'cone': h = [sh.radius * s[0], (sh.height * s[1]) / 2, sh.radius * s[0]]; break
    case 'capsule': h = [sh.radius * s[0], (sh.height * s[1]) / 2 + sh.radius * s[0], sh.radius * s[0]]; break
    case 'pyramid': h = [(sh.baseSize / 2) * s[0], (sh.height * s[1]) / 2, (sh.baseSize / 2) * s[2]]; break
    default: throw new Error(`unsupported shape ${sh.type} on ${e.id}`)
  }
  const [x, y, z] = (e.rotation as number[] | undefined) ?? [0, 0, 0]
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z)]
  const Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
  const Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
  const Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]
  const mm = (A: number[][], B: number[][]) => A.map((_, i) => B[0].map((__, j) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]))
  return { c: e.position as V3, h: h.map((v) => v + margin) as V3, R: mm(mm(Rx, Ry), Rz) }
}

/** Separating-axis overlap of two oriented boxes. */
function obbOverlap(a: Obb, b: Obb): boolean {
  const axes: V3[] = [0, 1, 2].map((i) => colOf(a.R, i)).concat([0, 1, 2].map((i) => colOf(b.R, i)))
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const c = cross(colOf(a.R, i), colOf(b.R, j))
      const n = Math.hypot(...c)
      if (n > 1e-6) axes.push([c[0] / n, c[1] / n, c[2] / n])
    }
  }
  const d: V3 = [b.c[0] - a.c[0], b.c[1] - a.c[1], b.c[2] - a.c[2]]
  for (const ax of axes) {
    let ra = 0
    let rb = 0
    for (let i = 0; i < 3; i++) {
      ra += a.h[i] * Math.abs(dot(colOf(a.R, i), ax))
      rb += b.h[i] * Math.abs(dot(colOf(b.R, i), ax))
    }
    if (ra + rb <= Math.abs(dot(d, ax))) return false
  }
  return true
}

const isGreen = (e: Ent) => {
  const c = (e.material as { color?: number[] } | undefined)?.color
  return !!c && [0.22, 0.72, 0.35].every((v, i) => Math.abs(c[i] - v) < 0.01)
}
/** Static boxes that act as walls: the `wall_*` labyrinth plus the older green static boxes. */
const isWallLike = (e: Ent) => e.bodyType === 'static' && e.shape?.type === 'box' && (isWall(e) || isGreen(e))

/** Planar distance from a point to the footprint (OBB, yaw only) of a box wall. */
function distToWall(wall: Ent, x: number, z: number): number {
  const s = wall.shape as { width: number; depth: number }
  const yaw = (wall.rotation as number[])[1]
  const dx = x - wall.position![0]
  const dz = z - wall.position![2]
  // local x axis in world = (cos, -sin) for a Y rotation
  const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw)
  const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw)
  const ox = Math.max(0, Math.abs(lx) - s.width / 2)
  const oz = Math.max(0, Math.abs(lz) - s.depth / 2)
  return Math.hypot(ox, oz)
}

type Bound = Ent & { transformerPipeStack?: { pipeId?: string; params?: Record<string, unknown> }[] }
/** Pursuers: AV pipe (eco), no threatIds, a `follow` goal-source stage. The AV itself has threatIds. */
const isChaser = (e: Bound, world: ReturnType<typeof loadLabWorld>) =>
  e.transformerPipeStack?.[0]?.pipeId === AV_PIPE &&
  !(e.transformerPipeStack[0].params?.threatIds as unknown[] | undefined)?.length &&
  (e.transformers ?? []).some((id) => (world.transformers as Record<string, { type?: string }>)[id]?.type === 'follow')

describe('self_hunt_flexible', () => {
  it('pack cars carry their pipeline once (no entity-level duplicate of the pipe stages)', () => {
    const world = loadLabWorld({ exampleId: 'self_hunt_flexible' })
    const stages = new Set((world.transformerPipes?.[AV_PIPE] as { stageIds: string[] }).stageIds)
    let n = 0
    for (const e of world.entities as Bound[]) {
      if (!isChaser(e, world)) continue
      n++
      expect(e.transformerPipeStack![0].params?.budget, `${e.id} budget`).toBe('eco')
      const ids = e.transformers ?? []
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of stages) expect(ids, `${e.id} pipe stage ${id}`).toContain(id)
      const extra = ids.filter((id) => !stages.has(id)).map((id) => (world.transformers as Record<string, { type?: string }>)[id]?.type)
      expect(extra.sort(), `${e.id} extra stages = goal source + actuator`).toEqual(['car2', 'follow'])
    }
    expect(n).toBe(10)
  })

  it('goal sources (follow / wanderer) run before the AV stack on every AV-pipe car', () => {
    // the chain runs by priority (stable on ties): a goal source with the same priority as global_av_ego but listed after it
    // left the autopilot reading last frame's target (Manuel spotted 'follow' after the autopilot in the Builder)
    const world = loadLabWorld({ exampleId: 'self_hunt_flexible' })
    const defs = (world as unknown as { transformers: Record<string, { type?: string; priority?: number }> }).transformers
    const prio = (id: string) => defs[id]?.priority ?? 10
    let n = 0
    for (const e of world.entities as Bound[]) {
      if (!(e.transformerPipeStack ?? []).some((b) => b.pipeId === AV_PIPE)) continue
      const ids = (e as unknown as { transformers?: string[] }).transformers ?? []
      const goal = ids.filter((id) => defs[id]?.type === 'follow' || defs[id]?.type === 'wanderer')
      expect(goal.length, `${e.id} has a goal source`).toBeGreaterThan(0)
      const egoAt = ids.indexOf('global_av_ego')
      for (const g of goal) {
        expect(prio(g) < prio('global_av_ego') || (prio(g) === prio('global_av_ego') && ids.indexOf(g) < egoAt), `${e.id}: ${g} before global_av_ego`).toBe(true)
      }
      n++
    }
    expect(n).toBeGreaterThanOrEqual(11)
  })

  it('has no referee, score, tint or beacon leftovers', () => {
    const world = loadLabWorld({ exampleId: 'self_hunt_flexible' })
    expect(world.scripts).not.toHaveProperty('hunt_referee')
    expect(world.entities.find((e) => e.id === 'hunt_referee' || e.id === 'hunt_beacon')).toBeUndefined()
    expect(world.entities.filter((e) => e.scripts?.includes('hunt_referee'))).toEqual([])
  })

  it('walls are static low boxes and no car or prop starts inside or near one', () => {
    const world = loadLabWorld({ exampleId: 'self_hunt_flexible' })
    const walls = world.entities.filter(isWall)
    expect(walls.length).toBeGreaterThanOrEqual(220)
    for (const k of ['D', 'E', 'F', 'G']) {
      expect(walls.filter((w) => w.id.startsWith(`wall_maze_${k}_`)).length, `maze ${k}`).toBeGreaterThanOrEqual(25)
    }
    for (const w of walls) {
      expect(w.bodyType).toBe('static')
      expect((w.shape as { type: string }).type).toBe('box')
      expect((w.shape as { height: number }).height).toBeLessThanOrEqual(2)
    }
    for (const e of world.entities) {
      if (isWall(e) || e.shape?.type === 'plane') continue
      const need = isCar(e) ? CAR_CLEARANCE : e.bodyType === 'dynamic' ? PROP_CLEARANCE : 0
      for (const w of walls) {
        const d = distToWall(w, e.position![0], e.position![2])
        expect(d, `${e.id} (${e.name}) to ${w.id}`).toBeGreaterThanOrEqual(need)
      }
    }
  })

  it('no dynamic entity intersects or rests on a static wall (2 m gap, conservative boxes)', () => {
    const world = loadLabWorld({ exampleId: 'self_hunt_flexible' })
    const walls = world.entities.filter(isWallLike)
    expect(walls.length).toBeGreaterThanOrEqual(220)
    const wallBoxes = walls.map((w) => ({ w, box: obbOf(w, 2) }))
    for (const e of world.entities) {
      if (e.bodyType !== 'dynamic' || e.shape?.type === 'plane') continue
      const box = obbOf(e)
      for (const { w, box: wb } of wallBoxes) {
        expect(obbOverlap(box, wb), `${e.id} (${e.name}) overlaps or rests above ${w.id}`).toBe(false)
      }
    }
  })

  it('has no score/collision scripts and every car carries the righting script', () => {
    const world = loadLabWorld({ exampleId: 'self_hunt_flexible' })
    expect(Object.keys(world.scripts ?? {})).toEqual(['hinnstellen'])
    expect((world.scripts as Record<string, { event: string }>).hinnstellen.event).toBe('onTimer')
    const cars = world.entities.filter((e) => e.id === 'car' || e.name?.startsWith('Player'))
    expect(cars.length).toBe(13)
    for (const e of cars) expect(e.scripts, `${e.id} scripts`).toEqual(['hinnstellen'])
    for (const e of world.entities) {
      for (const id of e.scripts ?? []) expect(world.scripts, `${e.id} -> ${id}`).toHaveProperty(id)
    }
  })

  it('simulates headless without errors and the chasers move', async () => {
    const world = loadLabWorld({ exampleId: 'self_hunt_flexible' })
    const det = installDeterminism(8, 0)
    const warn = console.warn
    console.warn = () => {}
    const sim = await WorldSimulator.create(world, 0)
    try {
      const pos = (id: string) => sim.getPhysicsWorld().getCachedTransform(id)!.position
      const chasers = world.entities.filter((e) => isChaser(e as Bound, world)).map((e) => e.id)
      sim.runFrames(1)
      const gapNow = () => { const a = pos(AV); return Math.min(...chasers.map((id) => Math.hypot(pos(id).x - a.x, pos(id).z - a.z))) }
      const startGap = gapNow()
      let minGap = Infinity
      const start = Object.fromEntries(chasers.map((id) => [id, { ...pos(id) }]))
      for (let f = 0; f < FRAMES; f++) {
        sim.runFrames(1)
        det.advance(1 / 60)
        {
          const a = pos(AV)
          for (const id of chasers) minGap = Math.min(minGap, Math.hypot(pos(id).x - a.x, pos(id).z - a.z))
        }
      }
      if (process.env.HUNT_LOG) console.log('hunt: min chaser-AV distance', minGap.toFixed(1))
      let moved = 0
      for (const id of chasers) {
        const p = pos(id)
        expect(Number.isFinite(p.x + p.y + p.z)).toBe(true)
        if (Math.hypot(p.x - start[id].x, p.z - start[id].z) > 10) moved++
      }
      expect(moved).toBeGreaterThanOrEqual(Math.floor(chasers.length / 2))
      // pursuit (follow with lead, non-final goal): the pack closes in on the AV. Absolute catch distances are chaotic per seed
      // (seed 8: 4.7 m on one commit, 12 m on the next), so assert the approach relative to the start; catches are tracked by av:health.
      expect(minGap, `closest chaser-AV distance vs start ${startGap.toFixed(1)} m`).toBeLessThan(0.6 * startGap)
    } finally {
      console.warn = warn
      sim.dispose()
    }
  }, 600_000)
})
