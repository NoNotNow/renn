import { createRef } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { RennWorld } from '@/types/world'
import { resolveFocusedStageConfigs, resolvePipeNavView } from '@/utils/pipeNavResolve'
import PipeFocusedStrip from './PipeFocusedStrip'

/**
 * Regression: a pipe whose members mix stages and nested pipes ([stage, pipe, stage]).
 * `StripItem.index` is the position among ALL members while `stageIds` lists only the stages, so the strip
 * used to drop (or mis-address) every stage that follows a nested pipe — the tree showed it, the strip did not.
 */
const world: RennWorld = {
  version: '1',
  world: {},
  entities: [{ id: 'e1', name: 'Buggy', transformers: ['first', 'inner', 'last'], transformerPipeStack: [{ pipeId: 'root' }] }],
  transformers: {
    first: { type: 'custom', name: 'First stage', code: '' },
    inner: { type: 'custom', name: 'Inner stage', code: '' },
    last: { type: 'custom', name: 'Last stage', code: '' },
    extra: { type: 'custom', name: 'Extra stage', code: '' },
  },
  transformerPipes: {
    root: {
      id: 'root',
      name: 'Root',
      stageIds: [],
      stages: [],
      members: [
        { kind: 'stage', stageId: 'first' },
        { kind: 'pipe', pipeId: 'child' },
        { kind: 'stage', stageId: 'last' },
        { kind: 'stage', stageId: 'extra' },
      ],
    },
    child: { id: 'child', name: 'Child pipe', stageIds: ['inner'], stages: [], members: [{ kind: 'stage', stageId: 'inner' }] },
  },
}

describe('PipeFocusedStrip with mixed stage / pipe members', () => {
  it('renders every stage member, including those after a nested pipe', () => {
    const entity = world.entities[0]!
    const focus = { path: [{ kind: 'stack' as const, index: 0 }], selectedSiblingIndex: 0 }
    const view = resolvePipeNavView(world, entity, focus)
    const stageData = resolveFocusedStageConfigs(world, entity, focus)
    expect(view.mode).toBe('pipe_members')
    expect(stageData.ids).toEqual(['first', 'last', 'extra']) // stages only: the nested pipe is not in this list

    render(
      <PipeFocusedStrip
        world={world}
        entity={entity}
        view={view}
        focusPath={focus.path}
        depth={1}
        selectedIndex={0}
        stageConfigs={stageData.configs}
        stageIds={stageData.ids}
        registryEntityId="e1"
        liveTraceSteps={null}
        drawerPortalTarget={createRef<HTMLDivElement>()}
        onCommitStages={vi.fn()}
        onPatchStage={vi.fn()}
        onSelectStageId={vi.fn()}
        onSelectPipeIndex={vi.fn()}
        onDrillIntoPipe={vi.fn()}
        onCreatePipe={vi.fn()}
        onAddChildPipe={vi.fn()}
        onAddLibraryPipe={vi.fn()}
      />,
    )

    expect(screen.getByText('First stage')).toBeInTheDocument()
    expect(screen.getByText('Child pipe')).toBeInTheDocument()
    expect(screen.getByText('Last stage')).toBeInTheDocument() // member index 2, only 3 stage ids → was dropped
    expect(screen.getByText('Extra stage')).toBeInTheDocument() // member index 3 → was dropped
  })
})
