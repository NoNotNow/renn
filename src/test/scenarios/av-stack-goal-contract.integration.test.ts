import { describe, expect, it } from 'vitest'
import { buildShippedGlobalBehaviorLibraryBundle } from '@/globalPipeline/buildSelfDrivingGlobalBehaviorLibrary'
import { copyGlobalPipeIntoWorld } from '@/globalPipeline/copyGlobalPipeIntoWorld'
import { mergeShippedGlobalBehaviorLibrary } from '@/globalPipeline/mergeShippedGlobalBehaviorLibrary'
import { AV_GLOBAL_AUTOPILOT_PIPE_ID } from '@/globalPipeline/buildAvStackGlobalBehaviorLibrary'
import { EMPTY_GLOBAL_BEHAVIOR_LIBRARY } from '@/types/globalBehaviorLibrary'
import type { TransformerConfig } from '@/types/transformer'
import { assignPipeToEntity } from '@/utils/commitTransformerConfigsToWorld'
import { applyEntityTransformerSync } from '@/utils/pipeNavResolve'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { WorldSimulator } from '@/test/helpers/worldSimulator'
import type { RennWorld } from '@/types/world'

const library = mergeShippedGlobalBehaviorLibrary(EMPTY_GLOBAL_BEHAVIOR_LIBRARY, buildShippedGlobalBehaviorLibraryBundle())

/**
 * The AV autopilot only speaks the engine's goal contract (`input.target`, optional `isFinal`). Any goal source — preset
 * wanderer, `follow` another entity, waypoint mission — plugs in front of it. Both sources below are *top-level stages*
 * next to the autopilot pipe (no pipe needed around them).
 */
function carWorld(goalSource: TransformerConfig, extra: RennWorld['entities'] = [], stackParams: Record<string, unknown> = {}): RennWorld {
  let world = {
    version: '1.0',
    world: { gravity: [0, -100, 0] },
    entities: [
      { id: 'floor', name: 'Floor', bodyType: 'static', shape: { type: 'box', width: 200, height: 1, depth: 200 }, position: [0, -0.5, 0], rotation: [0, 0, 0] },
      { id: 'buggy', name: 'Buggy', bodyType: 'dynamic', shape: { type: 'box', width: 2, height: 1, depth: 4 }, position: [0, 0.55, 5], rotation: [0, 0, 0], mass: 2, friction: 0.8 },
      ...extra,
    ],
  } as RennWorld
  world = copyGlobalPipeIntoWorld(world, library, AV_GLOBAL_AUTOPILOT_PIPE_ID)
  world = assignPipeToEntity(world, 'buggy', world.transformerPipes![AV_GLOBAL_AUTOPILOT_PIPE_ID]!, 'linked')
  world = {
    ...world,
    transformers: {
      ...world.transformers,
      goal_source: { ...goalSource, priority: 1 },
      car: library.transformers!.global_av_car as TransformerConfig,
    },
    entities: world.entities.map((e) => (e.id === 'buggy' ? { ...e, transformers: [...(e.transformers ?? []), 'goal_source', 'car'] } : e)),
  }
  world = {
    ...world,
    entities: world.entities.map((e) =>
      e.id === 'buggy' ?
        { ...e, transformerPipeStack: e.transformerPipeStack!.map((b) => ({ ...b, params: { ...b.params, ...stackParams } })) }
      : e,
    ),
  }
  return applyEntityTransformerSync(world, 'buggy')
}

describe('AV autopilot with any goal source (goal contract)', () => {
  it('preset wanderer (planar) as a top-level stage: the car roams instead of stopping at the first goal', async () => {
    const world = carWorld({
      type: 'wanderer',
      params: { speed: 10, jumpDistance: 45, linear: true, angular: false, planar: true, positionEpsilon: 9, perimeter: { center: [0, 0.55, 0], halfExtents: [60, 0, 60] } },
    } as TransformerConfig)
    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(world, 15)
    try {
      let travelled = 0
      let prev = sim.getPosition('buggy')
      const cells = new Set<string>()
      for (let f = 0; f < 5400; f++) {
        sim.runFrames(1)
        const p = sim.getPosition('buggy')
        travelled += Math.hypot(p[0] - prev[0], p[2] - prev[2])
        prev = p
        cells.add(`${Math.floor(p[0] / 25)},${Math.floor(p[2] / 25)}`)
        expect(p[1]).toBeGreaterThan(-0.55)
      }
      expect(travelled).toBeGreaterThan(300)
      expect(cells.size).toBeGreaterThanOrEqual(3)
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  }, 180_000)

  it('`follow` another entity as the goal: the car drives to it and holds next to it', async () => {
    const beacon = { id: 'beacon', name: 'Beacon', bodyType: 'static', shape: { type: 'sphere', radius: 1 }, position: [30, 1, -40], rotation: [0, 0, 0] } as RennWorld['entities'][number]
    const world = carWorld({ type: 'follow', params: { targetEntityId: 'beacon', speed: 10, linear: true, angular: false } } as TransformerConfig, [beacon], {
      // the goal sits inside the beacon's own footprint: stop at a standoff instead of trying to reach its centre
      goalReach: 9,
      goalTolerance: 10,
    })
    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(world, 15)
    try {
      let minDist = Infinity
      for (let f = 0; f < 3600; f++) {
        sim.runFrames(1)
        const p = sim.getPosition('buggy')
        minDist = Math.min(minDist, Math.hypot(p[0] - 30, p[2] + 40))
      }
      const p = sim.getPosition('buggy')
      expect(minDist).toBeLessThan(12)
      expect(Math.hypot(p[0] - 30, p[2] + 40)).toBeLessThan(15) // still next to it, not circling away
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  }, 180_000)
})
