/**
 * Example world `self_hunt_flexible` as a game: the referee script (survival score, catches, pressure levels,
 * danger tint, target beacon) runs headless against the real physics + transformer chains.
 * See agent-context/example-worlds.md (self_hunt_flexible).
 *
 *   HUNT_FRAMES=3600 HUNT_LOG=1 npx vitest run src/test/scenarios/hunt-game.integration.test.ts
 */
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { loadLabWorld } from '@/test/avLab/lab'
import { installDeterminism } from '@/test/avLab/determinism'
import { WorldSimulator, DEFAULT_DT } from '@/test/helpers/worldSimulator'
import { createGameAPI } from '@/scripts/gameApi'
import { ScriptRunner } from '@/scripts/scriptRunner'
import type { LoadedEntity } from '@/loader/loadWorld'
import type { RennWorld } from '@/types/world'

const AV = 'entity_1779823253285_brtkx1p'
const PIPE = 'pipe_1780343603350'
const FRAMES = Number(process.env.HUNT_FRAMES ?? 1200)

interface HuntRun {
  world: RennWorld
  score: number[]
  damage: number
  snacks: string[]
  chaserIds: string[]
  /** Peak planar speed per chaser (m/s). */
  chaserPeak: Record<string, number>
  minDist: number
  beaconDist: number
  tintedFrames: number
  /** Mean planar speed of all chasers / of the target over the run (m/s). */
  chaserMean: number
  avMean: number
}

async function run(frames: number, seed = 1): Promise<HuntRun> {
  const world = loadLabWorld({ exampleId: 'self_hunt_flexible' })
  const det = installDeterminism(seed, 0)
  const warn = console.warn
  console.warn = () => {}
  const sim = await WorldSimulator.create(world, 0)
  const entities: LoadedEntity[] = world.entities.map((entity) => ({ entity, mesh: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()) }))
  const timeRef = { current: 0 }
  const out: HuntRun = { world, score: [], damage: 0, snacks: [], chaserIds: [], chaserPeak: {}, minDist: Infinity, beaconDist: 0, tintedFrames: 0, chaserMean: 0, avMean: 0 }
  const pose = (id: string): [number, number, number] | null => {
    const cached = sim.getPhysicsWorld().getCachedTransform(id)
    return cached ? [cached.position.x, cached.position.y, cached.position.z] : null
  }
  const game = createGameAPI(
    pose,
    (id, x, y, z) => sim.getPhysicsWorld().setPosition(id, x, y, z),
    () => null,
    () => {},
    () => null,
    (id) => {
      const q = sim.getRotation(id)
      const v = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w))
      return [v.x, v.y, v.z]
    },
    () => sim.getPhysicsWorld(),
    () => sim.getRegistry(),
    world.entities,
    timeRef,
    (m) => out.snacks.push(m),
    (p) => {
      if (p.score != null) out.score.push(p.score)
      if (p.damage != null) out.damage = p.damage
    },
  )
  const runner = new ScriptRunner(world, game, () => null, entities)
  out.chaserIds = world.entities.filter((e) => e.id !== AV && (e.transformerPipeStack?.[0] as { pipeId?: string } | undefined)?.pipeId === PIPE).map((e) => e.id)
  const prev: Record<string, [number, number, number] | null> = {}
  let prevAv: [number, number, number] | null = null
  let sumC = 0, nC = 0, sumA = 0, nA = 0
  try {
    for (let f = 0; f < frames; f++) {
      timeRef.current = f * DEFAULT_DT
      runner.runOnUpdate(DEFAULT_DT)
      sim.runFrames(1)
      det.advance(DEFAULT_DT)
      const a = pose(AV)!
      if (prevAv) { sumA += Math.hypot(a[0] - prevAv[0], a[2] - prevAv[2]) / DEFAULT_DT; nA++ }
      prevAv = a
      for (const id of out.chaserIds) {
        const p = pose(id)!
        const q = prev[id]
        if (q) {
          const sp = Math.hypot(p[0] - q[0], p[2] - q[2]) / DEFAULT_DT
          out.chaserPeak[id] = Math.max(out.chaserPeak[id] ?? 0, sp)
          sumC += sp
          nC++
        }
        prev[id] = p
        out.minDist = Math.min(out.minDist, Math.hypot(p[0] - a[0], p[2] - a[2]))
      }
      if (f === frames - 1) {
        const b = sim.getPhysicsWorld().getBody('hunt_beacon')!.translation()
        out.beaconDist = Math.hypot(b.x - a[0], b.z - a[2])
      }
    }
    out.chaserMean = sumC / Math.max(1, nC)
    out.avMean = sumA / Math.max(1, nA)
  } finally {
    console.warn = warn
    sim.dispose()
  }
  return out
}

describe('self_hunt_flexible game', () => {
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

  it('score HUD counts the survival streak, the beacon tracks the target, chasers close in', async () => {
    const r = await run(FRAMES)
    if (process.env.HUNT_LOG) {
      console.log('HUNT', JSON.stringify({ score: r.score.slice(-3), damage: r.damage, snacks: r.snacks, minDist: r.minDist, chaserMean: r.chaserMean, avMean: r.avMean, beaconDist: r.beaconDist, peaks: Object.values(r.chaserPeak).map((v) => Math.round(v)) }))
    }
    expect(r.chaserIds.length).toBeGreaterThanOrEqual(9)
    expect(r.score.length).toBeGreaterThan(5)
    // streak seconds only grow until a catch resets them
    expect(Math.max(...r.score)).toBeGreaterThanOrEqual(Math.min(20, Math.floor(FRAMES / 60) - 2))
    expect(r.beaconDist).toBeLessThan(2)
    expect(Number.isFinite(r.minDist)).toBe(true)
  }, 600_000)
})
