import { describe, expect, it } from 'vitest'
import { buildShippedGlobalBehaviorLibraryBundle } from '@/globalPipeline/buildSelfDrivingGlobalBehaviorLibrary'
import { copyGlobalPipeIntoWorld } from '@/globalPipeline/copyGlobalPipeIntoWorld'
import {
  mergeShippedGlobalBehaviorLibrary,
} from '@/globalPipeline/mergeShippedGlobalBehaviorLibrary'
import { AV_GLOBAL_AUTOPILOT_PIPE_ID, AV_GLOBAL_STACK_PIPE_ID } from '@/globalPipeline/buildAvStackGlobalBehaviorLibrary'
import { EMPTY_GLOBAL_BEHAVIOR_LIBRARY } from '@/types/globalBehaviorLibrary'
import { assignPipeToEntity } from '@/utils/commitTransformerConfigsToWorld'
import { resolveEntityStageRuntime } from '@/utils/pipeStageResolve'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { WorldSimulator } from '@/test/helpers/worldSimulator'
import type { RennWorld } from '@/types/world'

/** A brand-new project that knows nothing about the AV stack: a floor, one box, one obstacle. */
function foreignProject(): RennWorld {
  return {
    version: '1.0',
    world: { gravity: [0, -100, 0] },
    entities: [
      { id: 'floor', name: 'Floor', bodyType: 'static', shape: { type: 'box', width: 160, height: 1, depth: 160 }, position: [0, -0.5, 0], rotation: [0, 0, 0] },
      { id: 'rock', name: 'Rock', bodyType: 'static', shape: { type: 'sphere', radius: 2.5 }, position: [12, 1.25, -30], rotation: [0, 0, 0] },
      { id: 'buggy', name: 'Buggy', bodyType: 'dynamic', shape: { type: 'box', width: 2, height: 1, depth: 4 }, position: [0, 0.55, 5], rotation: [0, 0, 0], mass: 2, friction: 0.8 },
    ],
  } as RennWorld
}

const library = mergeShippedGlobalBehaviorLibrary(EMPTY_GLOBAL_BEHAVIOR_LIBRARY, buildShippedGlobalBehaviorLibraryBundle())

describe('AV stack as a shipped global pipe', () => {
  it('is in the global library with nested pipes and seeded params', () => {
    const pipes = library.transformerPipes ?? {}
    expect(Object.keys(pipes)).toEqual(
      expect.arrayContaining([AV_GLOBAL_STACK_PIPE_ID, AV_GLOBAL_AUTOPILOT_PIPE_ID, 'global_av_sense', 'global_av_plan', 'global_av_control', 'global_av_safety']),
    )
    const stack = pipes[AV_GLOBAL_STACK_PIPE_ID]!
    expect(stack.members!.map((m) => (m.kind === 'pipe' ? m.pipeId : m.stageId))).toEqual([
      'global_av_mission',
      AV_GLOBAL_AUTOPILOT_PIPE_ID,
      'global_av_car',
    ])
    expect(stack.paramDefs!.map((p) => p.key)).toContain('cruiseSpeed')
  })

  it('copying into a project brings child pipes and every stage along', () => {
    const world = copyGlobalPipeIntoWorld(foreignProject(), library, AV_GLOBAL_STACK_PIPE_ID)
    for (const id of ['global_av_stack', 'global_av_autopilot', 'global_av_sense', 'global_av_plan', 'global_av_plan_route', 'global_av_plan_local', 'global_av_control', 'global_av_safety']) {
      expect(world.transformerPipes?.[id], id).toBeDefined()
    }
    expect(Object.keys(world.transformers ?? {}).length).toBe(12)
  })

  it('the autopilot pipe alone has no mission and no actuator (bring your own)', () => {
    const world = copyGlobalPipeIntoWorld(foreignProject(), library, AV_GLOBAL_AUTOPILOT_PIPE_ID)
    expect(world.transformers?.global_av_mission).toBeUndefined()
    expect(world.transformers?.global_av_car).toBeUndefined()
    expect(world.transformers?.global_av_route_planner).toBeDefined()
  })

  it('assigning the pipe to one object makes it drive its waypoint loop around an obstacle', async () => {
    let world = copyGlobalPipeIntoWorld(foreignProject(), library, AV_GLOBAL_STACK_PIPE_ID)
    world = assignPipeToEntity(world, 'buggy', world.transformerPipes![AV_GLOBAL_STACK_PIPE_ID]!, 'linked')
    const buggy = world.entities.find((e) => e.id === 'buggy')!
    expect(buggy.transformerPipeStack?.[0]?.params?.cruiseSpeed).toBe(10)
    const runtime = resolveEntityStageRuntime(world, buggy)
    expect(runtime.syncedStageIds()[0]).toBe('global_av_mission')

    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(world, 15)
    try {
      const visited = [false, false, false]
      const targets: [number, number][] = [[25, -30], [25, 0], [0, 0]]
      let minGap = Infinity
      for (let f = 0; f < 3600; f++) {
        sim.runFrames(1)
        const p = sim.getPosition('buggy')
        targets.forEach((t, i) => {
          if (Math.hypot(p[0] - t[0], p[2] - t[1]) < 9) visited[i] = true
        })
        minGap = Math.min(minGap, Math.hypot(p[0] - 12, p[2] + 30) - 2.5 - 1)
        expect(p[1]).toBeGreaterThan(-0.55) // stays on the floor
      }
      expect(visited).toEqual([true, true, true])
      expect(minGap).toBeGreaterThan(0) // never overlaps the rock
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  }, 120_000)
})
