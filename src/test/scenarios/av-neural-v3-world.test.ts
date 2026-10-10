import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readNeuralStageWeightsV3 } from '@/globalPipeline/avStackStagePaths'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { loadLabWorld, watchValues } from '@/test/avLab/lab'
import { ARENA_CAR_ID, AV_CAR_SOURCE_WORLD } from '@/test/fixtures/avEvasionArena'
import { buildNeuralV3ExampleWorld } from '@/test/fixtures/avCrowdCases'
import { SCENARIO_TIMEOUT } from '@/test/fixtures/avEvasionRunner'
import { WorldSimulator } from '@/test/helpers/worldSimulator'

/** `av_neural_v3` example world: the crowd scene with the v3 policy (forward + reverse). Regenerate: npx tsx tools/renn-mcp/export-av-neural-example-world.ts av_neural_v3 */
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
    expect(disk().transformers.global_av_neural.params.wV3).toEqual(readNeuralStageWeightsV3())
  })

  it('loads headlessly, the v3 net runs (av.neural reports state) and the car moves', async () => {
    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(disk(), 15)
    let on = 0
    let seen = 0
    let maxD = 0
    const start = sim.getPosition(ARENA_CAR_ID)
    try {
      for (let f = 0; f < 12 * 60; f++) {
        sim.runFrames(1)
        const p = sim.getPosition(ARENA_CAR_ID)
        maxD = Math.max(maxD, Math.hypot(p[0] - start[0], p[2] - start[2]))
        const n = watchValues(ARENA_CAR_ID)['av.neural']
        if (n !== undefined) seen++
        if (String(n ?? '').startsWith('on')) on++
      }
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
    expect(seen).toBeGreaterThan(0)
    expect(on).toBeGreaterThan(0)
    expect(maxD).toBeGreaterThan(10)
  }, SCENARIO_TIMEOUT)
})
