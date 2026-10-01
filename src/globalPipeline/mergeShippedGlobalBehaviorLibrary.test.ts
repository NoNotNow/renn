import { describe, expect, it } from 'vitest'
import { buildSelfDrivingGlobalBehaviorLibrary } from '@/globalPipeline/buildSelfDrivingGlobalBehaviorLibrary'
import { mergeShippedGlobalBehaviorLibrary } from '@/globalPipeline/mergeShippedGlobalBehaviorLibrary'
import { SHIPPED_GLOBAL_PIPE_PREFIX } from '@/globalPipeline/shippedGlobalBehaviorLibraryTypes'
import { EMPTY_GLOBAL_BEHAVIOR_LIBRARY } from '@/types/globalBehaviorLibrary'

describe('mergeShippedGlobalBehaviorLibrary', () => {
  it('injects shipped self-drive pipes and transformers', () => {
    const library = buildSelfDrivingGlobalBehaviorLibrary()
    const merged = mergeShippedGlobalBehaviorLibrary(EMPTY_GLOBAL_BEHAVIOR_LIBRARY, {
      version: 1,
      checksum: 'test-checksum',
      library,
    })
    expect(Object.keys(merged.transformerPipes ?? {}).some((id) => id.startsWith(SHIPPED_GLOBAL_PIPE_PREFIX))).toBe(
      true,
    )
    expect(Object.keys(merged.transformers).length).toBeGreaterThan(4)
    const pipe = merged.transformerPipes?.[`${SHIPPED_GLOBAL_PIPE_PREFIX}pipe3_wanderer`]
    expect(pipe?.stages.length).toBe(pipe?.stageIds.length)
  })
})
