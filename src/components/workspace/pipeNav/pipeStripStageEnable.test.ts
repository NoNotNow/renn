import { describe, expect, it } from 'vitest'
import type { RennWorld } from '@/types/world'
import {
  flatIndexOffsetForStackBinding,
  resolveEntityStageRuntime,
} from '@/utils/pipeStageResolve'
import { resolveStageStripChrome } from '@/components/workspace/stageStripScope'
import { pipeStripStageEnabledFromFocus } from './pipeStripStageEnable'

function disabledChildPipeManifold(): { world: RennWorld; entity: RennWorld['entities'][0] } {
  const world: RennWorld = {
    version: '1',
    world: {},
    entities: [
      {
        id: 'e1',
        transformers: ['s1', 's2'],
        transformerPipeStack: [{ pipeId: 'root' }],
      },
    ],
    transformers: {
      s1: { type: 'input' },
      s2: { type: 'car2' },
    },
    transformerPipes: {
      root: {
        id: 'root',
        name: 'Root',
        stageIds: ['s1', 's2'],
        stages: [],
        members: [
          { kind: 'stage', stageId: 's1' },
          { kind: 'pipe', pipeId: 'child', enabled: false },
        ],
      },
      child: {
        id: 'child',
        name: 'Child',
        stageIds: ['s2'],
        stages: [],
        members: [{ kind: 'stage', stageId: 's2' }],
      },
    },
  }
  return { world, entity: world.entities[0]! }
}

describe('pipeStripStageEnabledFromFocus', () => {
  it('greys every card in the strip when an ancestor pipe scope is disabled', () => {
    const { world, entity } = disabledChildPipeManifold()
    const runtime = resolveEntityStageRuntime(world, entity)
    const focusPath = [
      { kind: 'stack' as const, index: 0 },
      { kind: 'member' as const, pipeId: 'root', memberIndex: 1 },
    ]

    const chrome = resolveStageStripChrome({
      kind: 'pipeStrip',
      depth: 1,
      renderAddButton: () => null,
      isStageEnabled: pipeStripStageEnabledFromFocus(
        (path) => runtime.isScopeEnabled(path),
        focusPath,
      ),
    })

    expect(chrome.isStageEnabled(0)).toBe(false)
    expect(chrome.isStageEnabled(1)).toBe(false)

    const flatOffset = flatIndexOffsetForStackBinding(world, entity, 0)
    expect(runtime.isStageEnabledAt(flatOffset)).toBe(true)
  })
})
