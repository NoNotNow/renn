import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PipeFocusedStrip from '@/components/workspace/pipeNav/PipeFocusedStrip'
import type { RennWorld } from '@/types/world'
import type { PipeFocusedStripProps } from '@/components/workspace/pipeNav/PipeFocusedStrip'
import { patchStageConfigInWorld } from '@/utils/pipeNavMutations'

vi.mock('@monaco-editor/react', () => ({ default: () => null }))

/** Pipe with a stage and a nested pipe: the strip draws the stage as its own single-stage card. */
const world = {
  version: '1',
  world: {},
  entities: [{ id: 'e1', name: 'E', transformers: ['s1', 's2'], transformerPipeStack: [{ pipeId: 'outer', enabled: true }] }],
  transformers: {
    s1: { type: 'custom', name: 'S1', code: 'x', priority: 0 },
    s2: { type: 'custom', name: 'S2', code: 'y', priority: 1 },
  },
  transformerPipes: {
    outer: {
      id: 'outer',
      name: 'Outer',
      stageIds: ['s1', 's2'],
      stages: [],
      members: [
        { kind: 'stage', stageId: 's1' },
        { kind: 'pipe', pipeId: 'inner' },
      ],
    },
    inner: { id: 'inner', name: 'Inner', stageIds: ['s2'], stages: [], members: [{ kind: 'stage', stageId: 's2' }] },
  },
} as unknown as RennWorld

describe('removing a stage card inside a mixed pipe', () => {
  it('asks to delete the member instead of patching the registry with undefined', async () => {
    const onPatchStage = vi.fn()
    const onCommitStages = vi.fn()
    const onDeleteNode = vi.fn()
    const view = {
      mode: 'pipe_members',
      containerPipeId: 'outer',
      containerLabel: 'Outer',
      items: [
        { kind: 'stage', stageId: 's1', index: 0 },
        { kind: 'pipe', pipeId: 'inner', index: 1 },
      ],
    } as unknown as PipeFocusedStripProps['view']
    render(
      <PipeFocusedStrip
        {...({
          world,
          entity: world.entities[0],
          view,
          focusPath: [{ kind: 'stack', index: 0 }],
          depth: 1,
          selectedIndex: 0,
          stageConfigs: [world.transformers!.s1, world.transformers!.s2],
          stageIds: ['s1', 's2'],
          registryEntityId: 'e1',
          onCommitStages,
          onPatchStage,
          onDeleteNode,
          onSelectStageId: vi.fn(),
          onSelectPipeIndex: vi.fn(),
          onDrillIntoPipe: vi.fn(),
        } as unknown as Parameters<typeof PipeFocusedStrip>[0])}
      />,
    )
    await userEvent.setup({ delay: null }).click(screen.getAllByTitle('Remove transformer')[0]!)
    expect(onPatchStage).not.toHaveBeenCalled()
    expect(onDeleteNode).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'member_stage', parentPipeId: 'outer', memberIndex: 0, stageId: 's1' }),
    )
  })
})

describe('patchStageConfigInWorld', () => {
  it('ignores an undefined config', () => {
    expect(patchStageConfigInWorld(world, 's1', undefined as never)).toBe(world)
  })
})
