import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { polyGap, rectPoly } from '@/avEvolution/eval/geometry'
import { readNeuralStageWeightsV3 } from '@/globalPipeline/avStackStagePaths'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { loadLabWorld, watchValues, yawOf } from '@/test/avLab/lab'
import { ARENA_CAR_ID, AV_CAR_SOURCE_WORLD } from '@/test/fixtures/avEvasionArena'
import { NEURAL_CROWD_GOAL_MARKER_ID, buildNeuralV3ExampleWorld } from '@/test/fixtures/avCrowdCases'
import { CONTACT_GAP, GOAL_REACH, SCENARIO_TIMEOUT } from '@/test/fixtures/avEvasionRunner'
import { WorldSimulator } from '@/test/helpers/worldSimulator'

/** Measured 19.4 s (agent-context/example-worlds.md); the budget leaves ~5 s of headroom. */
const REACH_WITHIN_S = 25

/** `av_neural_v3` example world: the AV car parked nose-first in a dead-end bay with the v3 policy (forward + reverse): it must back out and reach the goal. Regenerate: npx tsx tools/renn-mcp/export-av-neural-example-world.ts av_neural_v3 */
describe('av_neural_v3 example world', () => {
  const disk = () => JSON.parse(readFileSync(join(process.cwd(), 'public/exampleWorlds/av_neural_v3/world.json'), 'utf8'))

  it('on disk equals the exporter output; v3 params + v3 weights on the neural stage', () => {
    const built = JSON.parse(JSON.stringify(buildNeuralV3ExampleWorld(loadLabWorld({ exampleId: AV_CAR_SOURCE_WORLD }))))
    expect(disk()).toEqual(built)
    const car = disk().entities.find((e: { id: string }) => e.id === ARENA_CAR_ID)
    const p = car.transformerPipeStack[0].params
    expect(p.neuralPolicy).toBe('v3')
    expect(p.neuralReverse).toBe(true)
    expect(p.neuralVMax).toBe(15)
    expect(p.neuralMode).toBe('always')
    expect(disk().transformers.global_av_neural.params.wV3).toEqual(readNeuralStageWeightsV3())
  })

  it('from disk, defined start: the v3 net takes over, backs out of the dead end (rev > 1 m), touches no wall and reaches the goal in time', async () => {
    setAgentObservationWatchActive(true)
    const world = disk() // fresh parse = every entity at its document pose
    const sim = await WorldSimulator.create(world, 15)
    const car = world.entities.find((e: { id: string }) => e.id === ARENA_CAR_ID)
    const goalE = world.entities.find((e: { id: string }) => e.id === NEURAL_CROWD_GOAL_MARKER_ID)
    const walls = world.entities
      .filter((e: { id: string }) => e.id.startsWith('arena_box'))
      .map((e: { position: number[]; shape: { width: number; depth: number } }) => rectPoly(e.position[0]!, e.position[2]!, 0, e.shape.width, e.shape.depth))
    let on = 0
    let revM = 0
    let revFrames = 0
    let contacts = 0
    let reachedT = Infinity
    try {
      for (let f = 0; f < REACH_WITHIN_S * 60; f++) {
        sim.runFrames(1)
        const p = sim.getPosition(ARENA_CAR_ID)
        const hull = rectPoly(p[0], p[2], yawOf(sim.getRotation(ARENA_CAR_ID)), car.shape.width, car.shape.depth)
        if (walls.some((w: ReturnType<typeof rectPoly>) => polyGap(hull, w) <= CONTACT_GAP)) contacts++
        const w = watchValues(ARENA_CAR_ID)
        if (String(w['av.neural'] ?? '').startsWith('on')) on++
        const m = /dir (\w+) ([\d.]+) m/.exec(String(w['av.neural.n'] ?? ''))
        if (m) {
          revM = Math.max(revM, +m[2]!)
          if (m[1] === 'rev') revFrames++
        }
        if (Math.hypot(p[0] - goalE.position[0], p[2] - goalE.position[2]) < GOAL_REACH) {
          reachedT = (f + 1) / 60
          break
        }
      }
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
    expect(on).toBeGreaterThan(0) // neural stage on (v3 params + weights are asserted above)
    expect(revFrames).toBeGreaterThan(0) // av.neural.n reported dir 'rev'
    expect(revM).toBeGreaterThan(1)
    expect(contacts).toBe(0)
    expect(reachedT).toBeLessThanOrEqual(REACH_WITHIN_S)
  }, SCENARIO_TIMEOUT)
})
