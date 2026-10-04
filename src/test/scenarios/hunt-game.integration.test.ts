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
const PIPE = 'pipe_1780343603350'
const FRAMES = Number(process.env.HUNT_FRAMES ?? 1800)
const CAR_CLEARANCE = 15
const PROP_CLEARANCE = 4

type Ent = ReturnType<typeof loadLabWorld>['entities'][number]
const isWall = (e: Ent) => e.id.startsWith('wall_')
const isCar = (e: Ent) => e.id === AV || (e.transformerPipeStack?.length ?? 0) > 0 || e.id === 'entity_1780566414550_ju2ejzl'

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

describe('self_hunt_flexible', () => {
  it('pack cars carry their pipeline once (no entity-level duplicate of the pipe stages)', () => {
    const world = loadLabWorld({ exampleId: 'self_hunt_flexible' })
    const stages = new Set((world.transformerPipes?.[PIPE] as { stageIds: string[] }).stageIds)
    let n = 0
    for (const e of world.entities) {
      if (e.transformerPipeStack?.[0]?.pipeId !== PIPE) continue
      n++
      const extra = (e.transformers ?? []).filter((id) => !stages.has(id))
      expect(extra, `${e.id} entity-level stages beyond the pipe`).toEqual([])
      expect(new Set(e.transformers).size).toBe(e.transformers?.length)
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
    expect(walls.length).toBeGreaterThanOrEqual(40)
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

  it('simulates headless without errors and the chasers move', async () => {
    const world = loadLabWorld({ exampleId: 'self_hunt_flexible' })
    const det = installDeterminism(1, 0)
    const warn = console.warn
    console.warn = () => {}
    const sim = await WorldSimulator.create(world, 0)
    try {
      const pos = (id: string) => sim.getPhysicsWorld().getCachedTransform(id)!.position
      const chasers = world.entities.filter((e) => e.id !== AV && e.transformerPipeStack?.[0]?.pipeId === PIPE).map((e) => e.id)
      sim.runFrames(1)
      const start = Object.fromEntries(chasers.map((id) => [id, { ...pos(id) }]))
      for (let f = 0; f < FRAMES; f++) {
        sim.runFrames(1)
        det.advance(1 / 60)
      }
      let moved = 0
      for (const id of chasers) {
        const p = pos(id)
        expect(Number.isFinite(p.x + p.y + p.z)).toBe(true)
        if (Math.hypot(p.x - start[id].x, p.z - start[id].z) > 10) moved++
      }
      expect(moved).toBeGreaterThanOrEqual(Math.floor(chasers.length / 2))
    } finally {
      console.warn = warn
      sim.dispose()
    }
  }, 600_000)
})
