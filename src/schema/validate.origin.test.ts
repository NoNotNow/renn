import { describe, expect, it } from 'vitest'
import { buildShippedGlobalBehaviorLibraryBundle } from '@/globalPipeline/buildSelfDrivingGlobalBehaviorLibrary'
import { copyGlobalPipeIntoWorld } from '@/globalPipeline/copyGlobalPipeIntoWorld'
import { mergeShippedGlobalBehaviorLibrary } from '@/globalPipeline/mergeShippedGlobalBehaviorLibrary'
import { AV_GLOBAL_STACK_PIPE_ID } from '@/globalPipeline/buildAvStackGlobalBehaviorLibrary'
import { EMPTY_GLOBAL_BEHAVIOR_LIBRARY } from '@/types/globalBehaviorLibrary'
import { assignPipeToEntity } from '@/utils/commitTransformerConfigsToWorld'
import type { RennWorld } from '@/types/world'
import { validateWorldDocument } from './validate'

describe('worlds with global-library copies validate strictly', () => {
  it('keeps `origin` on stages and pipes (no "unknown field" stripping)', () => {
    const library = mergeShippedGlobalBehaviorLibrary(EMPTY_GLOBAL_BEHAVIOR_LIBRARY, buildShippedGlobalBehaviorLibraryBundle())
    let world = {
      version: '1.0',
      world: { gravity: [0, -10, 0] },
      entities: [{ id: 'b', name: 'B', bodyType: 'dynamic', shape: { type: 'box', width: 1, height: 1, depth: 1 }, position: [0, 1, 0], rotation: [0, 0, 0] }],
    } as RennWorld
    world = copyGlobalPipeIntoWorld(world, library, AV_GLOBAL_STACK_PIPE_ID)
    world = assignPipeToEntity(world, 'b', world.transformerPipes![AV_GLOBAL_STACK_PIPE_ID]!, 'linked')
    expect(world.transformers!.global_av_ego!.origin).toBeDefined()

    const warnings: string[] = []
    const out = structuredClone(world)
    validateWorldDocument(out, { tolerateAdditionalProperties: true, warningsOut: warnings, logAdditionalProperties: false })
    expect(warnings).toEqual([])
    expect(out.transformers!.global_av_ego!.origin).toEqual(world.transformers!.global_av_ego!.origin)
    expect(out.transformerPipes![AV_GLOBAL_STACK_PIPE_ID]!.origin).toBeDefined()
  })
})
