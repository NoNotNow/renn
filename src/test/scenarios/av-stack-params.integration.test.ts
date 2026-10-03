import { describe, expect, it } from 'vitest'
import { buildShippedGlobalBehaviorLibraryBundle } from '@/globalPipeline/buildSelfDrivingGlobalBehaviorLibrary'
import { copyGlobalPipeIntoWorld } from '@/globalPipeline/copyGlobalPipeIntoWorld'
import { mergeShippedGlobalBehaviorLibrary } from '@/globalPipeline/mergeShippedGlobalBehaviorLibrary'
import { AV_GLOBAL_STACK_PIPE_ID } from '@/globalPipeline/buildAvStackGlobalBehaviorLibrary'
import { EMPTY_GLOBAL_BEHAVIOR_LIBRARY } from '@/types/globalBehaviorLibrary'
import { assignPipeToEntity } from '@/utils/commitTransformerConfigsToWorld'
import { updateBindingParams } from '@/utils/pipeNavMutations'
import { resolveMergedTransformerConfigsForEntitySync } from '@/utils/pipeStageResolve'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { WorldSimulator } from '@/test/helpers/worldSimulator'
import type { RennWorld } from '@/types/world'

const library = mergeShippedGlobalBehaviorLibrary(EMPTY_GLOBAL_BEHAVIOR_LIBRARY, buildShippedGlobalBehaviorLibraryBundle())

/** Long straight run on an open floor: the only thing that can limit the speed is the pipe's `cruiseSpeed`. */
function openFieldWorld(cruiseSpeed: number): RennWorld {
  let world = {
    version: '1.0',
    world: { gravity: [0, -100, 0] },
    entities: [
      { id: 'floor', bodyType: 'static', shape: { type: 'box', width: 1200, height: 1, depth: 1200 }, position: [0, -0.5, 0], rotation: [0, 0, 0] },
      { id: 'buggy', bodyType: 'dynamic', shape: { type: 'box', width: 2, height: 1, depth: 4 }, position: [0, 0.55, 5], rotation: [0, 0, 0], mass: 2, friction: 0.8 },
    ],
  } as unknown as RennWorld
  world = copyGlobalPipeIntoWorld(world, library, AV_GLOBAL_STACK_PIPE_ID)
  world = assignPipeToEntity(world, 'buggy', world.transformerPipes![AV_GLOBAL_STACK_PIPE_ID]!, 'linked')
  world.transformers!.global_av_mission!.params = { waypoints: [[0, -500]], acceptRadius: 9, mode: 'stop' }
  return updateBindingParams(world, 'buggy', 0, { cruiseSpeed })
}

async function topSpeed(world: RennWorld, frames: number): Promise<number> {
  setAgentObservationWatchActive(true)
  const sim = await WorldSimulator.create(world, 15)
  try {
    let max = 0
    for (let f = 0; f < frames; f++) {
      sim.runFrames(1)
      const v = sim.getVelocity('buggy')
      max = Math.max(max, Math.hypot(v[0], v[2]))
    }
    return max
  } finally {
    sim.dispose()
    setAgentObservationWatchActive(false)
  }
}

describe('AV stack: pipe param `cruiseSpeed` is what the car drives', () => {
  it('is taken at start-up: the car reaches (and does not exceed) the set speed', async () => {
    const slow = await topSpeed(openFieldWorld(5), 900)
    const mid = await topSpeed(openFieldWorld(10), 900)
    expect(slow).toBeGreaterThan(4.5)
    expect(slow).toBeLessThan(5.6)
    expect(mid).toBeGreaterThan(9)
    expect(mid).toBeLessThan(10.8)
  }, 120_000)

  it('is not capped by the stock sensing/planning distances: a higher cruiseSpeed drives faster than 15.8 m/s', async () => {
    // 26 m horizon at 5 m/s² braking used to cap every cruiseSpeed at sqrt(2 * 5 * 25) = 15.8 m/s
    const fast = await topSpeed(openFieldWorld(24), 2400)
    expect(fast).toBeGreaterThan(17)
  }, 120_000)

  it('changes live: editing the pipe param while driving re-targets the speed', async () => {
    const world = openFieldWorld(10)
    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(world, 15)
    try {
      const speed = () => {
        const v = sim.getVelocity('buggy')
        return Math.hypot(v[0], v[2])
      }
      sim.runFrames(600)
      expect(speed()).toBeGreaterThan(8.5)
      const registry = (sim as unknown as { registry: { syncEntityTransformers: (id: string, c: unknown) => void } }).registry
      const slowed = updateBindingParams(world, 'buggy', 0, { cruiseSpeed: 4 })
      registry.syncEntityTransformers('buggy', resolveMergedTransformerConfigsForEntitySync(slowed, 'buggy'))
      sim.runFrames(480)
      expect(speed()).toBeLessThan(5)
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  }, 120_000)
})


describe('AV stack: obstacles only slow the car when they matter', () => {
  const box = (id: string, x: number, z: number) => ({
    id,
    bodyType: 'static',
    shape: { type: 'box', width: 3, height: 3, depth: 3 },
    position: [x, 1.5, z],
    rotation: [0, 0, 0],
  })
  const run = async (obstacles: ReturnType<typeof box>[], params: Record<string, unknown> = {}) => {
    let world = openFieldWorld(14)
    world = { ...world, entities: [...world.entities, ...(obstacles as never[])] }
    world = updateBindingParams(world, 'buggy', 0, params)
    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(world, 15)
    try {
      let sum = 0
      let n = 0
      for (let f = 0; f < 900; f++) {
        sim.runFrames(1)
        const v = sim.getVelocity('buggy')
        if (f > 240) {
          sum += Math.hypot(v[0], v[2])
          n++
        }
      }
      return sum / n
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  }

  it('obstacles far to the side and behind do not slow the car', async () => {
    const clear = await run([])
    const farAside = await run([box('a', 16, -50), box('b', -16, -90), box('c', 16, -130), box('d', 0, 40)])
    expect(clear).toBeGreaterThan(11)
    expect(farAside).toBeGreaterThan(clear * 0.9)
  }, 120_000)

  it('an obstacle right next to the lane slows the car, and the radius is adjustable (0 = off)', async () => {
    const closeAside = [box('a', 4.2, -50), box('b', -4.2, -90), box('c', 4.2, -130)]
    const near = await run(closeAside)
    const off = await run(closeAside, { obstacleSlowRadius: 0 })
    const wide = await run(closeAside, { obstacleSlowFactor: 1 })
    expect(near).toBeLessThan(off * 0.95)
    expect(wide).toBeGreaterThan(near)
  }, 180_000)

  it('an obstacle in the path is handled like auto-brake: full speed until the braking distance', async () => {
    let world = openFieldWorld(14)
    world = { ...world, entities: [...world.entities, box('wall', 0, -120) as never] }
    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(world, 15)
    try {
      let topSpeed = 0
      for (let f = 0; f < 1200; f++) {
        sim.runFrames(1)
        const v = sim.getVelocity('buggy')
        topSpeed = Math.max(topSpeed, Math.hypot(v[0], v[2]))
        expect(sim.getPosition('buggy')[1]).toBeGreaterThan(-0.5)
      }
      expect(topSpeed).toBeGreaterThan(12) // not held back by a far-away obstacle
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  }, 120_000)
})
