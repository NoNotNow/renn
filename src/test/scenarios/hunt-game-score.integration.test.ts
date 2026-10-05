/**
 * Score and damage of the AV car in `self_hunt_flexible` (av-ego `scoreKeeping`, params `hud`, `goalReachDist`, `damageDist`, `damageClear`):
 *  - score +1 whenever the goal source replaces its goal while the car is within `goalReachDist` of it (the car reached the goal),
 *  - damage +1 per chaser approach episode (centre closer than `damageDist`, re-armed beyond `damageClear`), never per frame.
 * Both are published as watch rows `av.goals` / `av.hits` and pushed to the game HUD (`api.setScore` / `api.setDamage`).
 * Relative assertions against an independent oracle computed from the poses (no absolute per-seed numbers).
 */
import { describe, expect, it } from 'vitest'
import { loadLabWorld, watchValues } from '@/test/avLab/lab'
import { installDeterminism } from '@/test/avLab/determinism'
import { WorldSimulator } from '@/test/helpers/worldSimulator'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { setTransformerHudFn } from '@/transformers/customCodeTransformer'

const AV = 'entity_1779823253285_brtkx1p'
const AV_PIPE = 'global_av_autopilot'

type World = ReturnType<typeof loadLabWorld>
type Bound = World['entities'][number] & { transformerPipeStack?: { pipeId?: string; params?: Record<string, unknown> }[] }

const isChaser = (e: Bound, world: World) =>
  e.transformerPipeStack?.[0]?.pipeId === AV_PIPE &&
  !(e.transformerPipeStack[0].params?.threatIds as unknown[] | undefined)?.length &&
  (e.transformers ?? []).some((id) => (world.transformers as Record<string, { type?: string }>)[id]?.type === 'follow')

const avParams = (world: World) => (world.entities as Bound[]).find((e) => e.id === AV)!.transformerPipeStack![0].params!

function hudRecorder() {
  const last = { score: -1, damage: -1 }
  setTransformerHudFn((p) => {
    if (p.score !== undefined) last.score = p.score
    if (p.damage !== undefined) last.damage = p.damage
  })
  return last
}

describe('self_hunt_flexible score and damage', () => {
  it('the AV binding turns the HUD feed on', () => {
    const p = avParams(loadLabWorld({ exampleId: 'self_hunt_flexible' }))
    expect(p.hud).toBe(true)
    expect(p.goalViz).toBe(true)
    expect(p.goalReachDist).toBeGreaterThanOrEqual(30)
  })

  it('score +1 per reached goal (goal source replaced its goal near the car)', async () => {
    const world = loadLabWorld({ exampleId: 'self_hunt_flexible' })
    // the AV alone on the labyrinth map: wander goals, no pursuers
    world.entities = world.entities.filter((e) => !isChaser(e as Bound, world))
    const reach = avParams(world).goalReachDist as number
    const det = installDeterminism(8, 0)
    const warn = console.warn
    console.warn = () => {}
    setAgentObservationWatchActive(true)
    const hud = hudRecorder()
    const sim = await WorldSimulator.create(world, 0)
    try {
      const wanderer = sim.getRegistry().get(AV)!.transformerChain!.getAll().find((t) => t.type === 'wanderer') as unknown as { currentTarget: { position: number[] } | null }
      const goal = () => wanderer.currentTarget?.position.slice() ?? null
      let score = 0
      let changes = 0
      let prevGoal = goal()
      for (let f = 0; f < 2400 && score < 2; f++) {
        const before = sim.getPosition(AV)
        sim.runFrames(1)
        det.advance(1 / 60)
        const g = goal()
        const now = Number(watchValues(AV)['av.goals'] ?? 0)
        if (g && prevGoal && Math.hypot(g[0]! - prevGoal[0]!, g[2]! - prevGoal[2]!) > 1e-6) changes++
        if (now !== score) {
          expect(now, 'score rises one goal at a time').toBe(score + 1)
          expect(prevGoal, 'a goal existed').not.toBeNull()
          // the car was within the source's accept radius of the goal it just left
          expect(Math.hypot(before[0] - prevGoal![0]!, before[2] - prevGoal![2]!), `car to the reached goal at frame ${f}`).toBeLessThanOrEqual(reach)
          score = now
        }
        prevGoal = g
      }
      expect(score, 'the AV reached at least one wander goal').toBeGreaterThanOrEqual(1)
      expect(score, 'never more points than goal changes').toBeLessThanOrEqual(changes)
      expect(hud.score, 'HUD score = watch').toBe(score)
      expect(hud.damage, 'HUD damage fed').toBe(0)
    } finally {
      console.warn = warn
      setTransformerHudFn(null)
      setAgentObservationWatchActive(false)
      sim.dispose()
    }
  }, 600_000)

  it('damage +1 per chaser approach episode, not per frame', async () => {
    const world = loadLabWorld({ exampleId: 'self_hunt_flexible' })
    // wide thresholds so the pack certainly crosses them within the test window (the oracle uses the same numbers)
    const params = avParams(world)
    params.damageDist = 40
    params.damageClear = 70
    const chasers = world.entities.filter((e) => isChaser(e as Bound, world)).map((e) => e.id)
    const det = installDeterminism(8, 0)
    const warn = console.warn
    console.warn = () => {}
    setAgentObservationWatchActive(true)
    const hud = hudRecorder()
    const sim = await WorldSimulator.create(world, 0)
    try {
      const near = new Set<string>()
      let episodes = 0
      let closeFrames = 0
      const FRAMES = 600
      for (let f = 0; f < FRAMES; f++) {
        // the stage sees the poses at the start of the frame: sample the oracle before stepping
        const a = sim.getPosition(AV)
        let any = false
        for (const id of chasers) {
          const p = sim.getPosition(id)
          const d = Math.hypot(p[0] - a[0], p[2] - a[2])
          if (near.has(id)) {
            if (d > 70) near.delete(id)
          } else if (d < 40) {
            near.add(id)
            episodes++
          }
          if (d < 40) any = true
        }
        if (any) closeFrames++
        sim.runFrames(1)
        det.advance(1 / 60)
      }
      const hits = Number(watchValues(AV)['av.hits'])
      expect(episodes, 'oracle: the pack comes within the damage distance').toBeGreaterThanOrEqual(1)
      expect(hits, 'damage = approach episodes').toBe(episodes)
      expect(hits, 'counted per episode, not per frame').toBeLessThan(closeFrames)
      expect(hud.damage, 'HUD damage = watch').toBe(hits)
    } finally {
      console.warn = warn
      setTransformerHudFn(null)
      setAgentObservationWatchActive(false)
      sim.dispose()
    }
  }, 600_000)
})
