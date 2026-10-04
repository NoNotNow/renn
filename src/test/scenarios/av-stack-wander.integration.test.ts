import { describe, expect, it } from 'vitest'
import { buildShippedGlobalBehaviorLibraryBundle } from '@/globalPipeline/buildSelfDrivingGlobalBehaviorLibrary'
import { copyGlobalPipeIntoWorld } from '@/globalPipeline/copyGlobalPipeIntoWorld'
import { mergeShippedGlobalBehaviorLibrary } from '@/globalPipeline/mergeShippedGlobalBehaviorLibrary'
import { AV_GLOBAL_WANDER_STACK_PIPE_ID } from '@/globalPipeline/buildAvStackGlobalBehaviorLibrary'
import { EMPTY_GLOBAL_BEHAVIOR_LIBRARY } from '@/types/globalBehaviorLibrary'
import { assignPipeToEntity } from '@/utils/commitTransformerConfigsToWorld'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { WorldSimulator } from '@/test/helpers/worldSimulator'
import type { RennWorld } from '@/types/world'
import { AV_GLOBAL_STACK_PIPE_ID } from '@/globalPipeline/buildAvStackGlobalBehaviorLibrary'
import { commitFocusedStageConfigs, deletePipeMember } from '@/utils/pipeNavMutations'
import type { TransformerConfig } from '@/types/transformer'

const library = mergeShippedGlobalBehaviorLibrary(EMPTY_GLOBAL_BEHAVIOR_LIBRARY, buildShippedGlobalBehaviorLibraryBundle())

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

describe('AV stack with a random-goal source (wander) instead of waypoints', () => {
  it('is in the library as a stage and as a ready-made pipe', () => {
    expect(library.transformers?.global_av_wander).toBeDefined()
    expect(library.transformerPipes?.[AV_GLOBAL_WANDER_STACK_PIPE_ID]?.members?.[0]).toEqual({ kind: 'stage', stageId: 'global_av_wander' })
  })

  it('keeps picking new goals and reaches several of them without hitting the rock', async () => {
    let world = copyGlobalPipeIntoWorld(foreignProject(), library, AV_GLOBAL_WANDER_STACK_PIPE_ID)
    world = assignPipeToEntity(world, 'buggy', world.transformerPipes![AV_GLOBAL_WANDER_STACK_PIPE_ID]!, 'linked')
    world = {
      ...world,
      entities: world.entities.map((e) =>
        e.id === 'buggy'
          ? { ...e, transformerPipeStack: e.transformerPipeStack!.map((b) => ({ ...b, params: { ...b.params, drivableArea: [-70, 70, -70, 70] } })) }
          : e,
      ),
    }
    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(world, 15)
    try {
      let minGap = Infinity
      let travelled = 0
      let prev = sim.getPosition('buggy')
      const cells = new Set<string>()
      for (let f = 0; f < 5400; f++) {
        sim.runFrames(1)
        const p = sim.getPosition('buggy')
        travelled += Math.hypot(p[0] - prev[0], p[2] - prev[2])
        prev = p
        cells.add(`${Math.floor(p[0] / 25)},${Math.floor(p[2] / 25)}`)
        minGap = Math.min(minGap, Math.hypot(p[0] - 12, p[2] + 30) - 2.5 - 1)
        expect(p[1]).toBeGreaterThan(-0.55)
      }
      expect(travelled).toBeGreaterThan(300) // keeps driving instead of stopping at the first goal
      expect(cells.size).toBeGreaterThanOrEqual(4) // roams over different areas
      expect(minGap).toBeGreaterThan(0)
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  }, 180_000)
})

describe('replacing the mission of an assigned AV stack by a wander stage, the way the Transformers UI does it', () => {
  it('keeps the stack working: new first stage + removed mission, ordered by preserved priorities', async () => {
    let world = copyGlobalPipeIntoWorld(foreignProject(), library, AV_GLOBAL_STACK_PIPE_ID)
    world = assignPipeToEntity(world, 'buggy', world.transformerPipes![AV_GLOBAL_STACK_PIPE_ID]!, 'linked')
    // UI path: "+" in the focused av_stack pipe -> strip hands over re-indexed (0..n) configs with the new stage first
    const stackPipe = world.transformerPipes![AV_GLOBAL_STACK_PIPE_ID]!
    const stageIds = stackPipe.members!.filter((m) => m.kind === 'stage').map((m) => (m as { stageId: string }).stageId)
    const wander = { ...(library.transformers!.global_av_wander as TransformerConfig) }
    const ids = ['wander_new', ...stageIds]
    const configs = [wander, ...stageIds.map((id) => world.transformers![id]!)].map((c, i) => ({ ...c, priority: i })) as TransformerConfig[]
    world = commitFocusedStageConfigs(world, 'buggy', [{ kind: 'stack', index: 0 }], configs, ids, ids)
    // then remove the old mission member (tree delete)
    const members = world.transformerPipes![AV_GLOBAL_STACK_PIPE_ID]!.members!
    const missionIdx = members.findIndex((m) => m.kind === 'stage' && m.stageId === 'global_av_mission')
    world = deletePipeMember(world, 'buggy', AV_GLOBAL_STACK_PIPE_ID, missionIdx)
    // nested pipes stayed in their slots, the others kept their priorities
    expect(world.transformerPipes![AV_GLOBAL_STACK_PIPE_ID]!.members!.map((m) => (m.kind === 'pipe' ? m.pipeId : m.stageId))).toEqual([
      'wander_new',
      'global_av_autopilot',
      'global_av_car',
    ])
    expect(world.transformers!.global_av_car!.priority).toBe(8)
    expect(world.transformers!.wander_new!.priority).toBeLessThan(world.transformers!.global_av_ego!.priority!)
    world = {
      ...world,
      entities: world.entities.map((e) =>
        e.id === 'buggy'
          ? { ...e, transformerPipeStack: e.transformerPipeStack!.map((b) => ({ ...b, params: { ...b.params, drivableArea: [-70, 70, -70, 70] } })) }
          : e,
      ),
    }

    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(world, 15)
    try {
      let travelled = 0
      let prev = sim.getPosition('buggy')
      for (let f = 0; f < 3600; f++) {
        sim.runFrames(1)
        const p = sim.getPosition('buggy')
        travelled += Math.hypot(p[0] - prev[0], p[2] - prev[2])
        prev = p
        if (travelled > 300) break
      }
      expect(travelled).toBeGreaterThan(300)
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  }, 180_000)
})
