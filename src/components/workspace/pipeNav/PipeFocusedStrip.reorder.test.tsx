import { createRef } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { RennWorld } from '@/types/world'
import type { PipeNavFocus, PipeTreeNode } from '@/types/pipeNav'
import { resolveFocusedStageConfigs, resolvePipeNavView } from '@/utils/pipeNavResolve'
import PipeFocusedStrip from './PipeFocusedStrip'

const world: RennWorld = {
  version: '1',
  world: {},
  entities: [{ id: 'e1', name: 'Buggy', transformers: ['a1', 'wander'], transformerPipeStack: [{ pipeId: 'pa' }] }],
  transformers: {
    a1: { type: 'custom', name: 'A stage', code: '', priority: 2 },
    wander: { type: 'custom', name: 'Wander stage', code: '', priority: 9 },
    mid: { type: 'custom', name: 'Mid stage', code: '', priority: 8 },
  },
  transformerPipes: {
    pa: { id: 'pa', name: 'Pipe A', stageIds: ['a1'], stages: [], members: [{ kind: 'stage', stageId: 'a1' }] },
    root: {
      id: 'root',
      name: 'Root',
      stageIds: ['mid'],
      stages: [],
      members: [{ kind: 'pipe', pipeId: 'pa' }, { kind: 'stage', stageId: 'mid' }],
    },
  },
}

function renderStrip(w: RennWorld, focus: PipeNavFocus, handlers: { entityLevel?: (fromKey: string, toIndex: number) => void; members?: (pipeId: string, from: number, to: number) => void; deleteNode?: (node: PipeTreeNode) => void }) {
  const entity = w.entities[0]!
  const view = resolvePipeNavView(w, entity, focus)
  const stageData = resolveFocusedStageConfigs(w, entity, focus)
  render(
    <PipeFocusedStrip
      world={w}
      entity={entity}
      view={view}
      focusPath={focus.path}
      depth={0}
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
      onReorderEntityLevel={handlers.entityLevel}
      onReorderMembers={handlers.members}
      onDeleteNode={handlers.deleteNode}
    />,
  )
}

function drag(fromSlotId: string, ontoSlotId: string) {
  // the real dragstart comes from the card / pipe header inside the slot and bubbles up to it
  fireEvent.dragStart(screen.getByTestId(fromSlotId), { dataTransfer: { setData: vi.fn(), effectAllowed: '' } })
  fireEvent.dragOver(screen.getByTestId(ontoSlotId))
  fireEvent.drop(screen.getByTestId(ontoSlotId))
}

describe('PipeFocusedStrip drag to reorder', () => {
  it('entity level: a top-level stage can be dragged in front of the pipe', () => {
    const entityLevel = vi.fn()
    renderStrip(world, { path: [], selectedSiblingIndex: 0 }, { entityLevel })
    // displayed in run order: pipe (priority 2), then the stage (9)
    const slots = screen.getAllByTestId(/^strip-slot-/).map((el) => el.getAttribute('data-testid'))
    expect(slots).toEqual(['strip-slot-pipe:0', 'strip-slot-stage:wander'])
    drag('strip-slot-stage:wander', 'strip-slot-pipe:0')
    expect(entityLevel).toHaveBeenCalledWith('stage:wander', 0)
  })

  it('mixed pipe members: a stage can be dragged in front of the nested pipe', () => {
    const members = vi.fn()
    const w: RennWorld = { ...world, entities: [{ ...world.entities[0]!, transformerPipeStack: [{ pipeId: 'root' }] }] }
    renderStrip(w, { path: [{ kind: 'stack', index: 0 }], selectedSiblingIndex: 0 }, { members })
    drag('strip-slot-member:1', 'strip-slot-member:0')
    expect(members).toHaveBeenCalledWith('root', 1, 0)
  })

  it('pipe cards have a × that deletes the pipe (entity level and inside a pipe)', () => {
    const deleteNode = vi.fn()
    renderStrip(world, { path: [], selectedSiblingIndex: 0 }, { deleteNode })
    fireEvent.click(screen.getByTestId('pipe-card-remove'))
    expect(deleteNode).toHaveBeenCalledWith({ kind: 'stack_pipe', pipeId: 'pa', stackIndex: 0, label: 'Pipe A' })
  })

  it('the pipe card header is the drag handle', () => {
    renderStrip(world, { path: [], selectedSiblingIndex: 0 }, {})
    const header = document.querySelector('[data-strip-drag-handle]') as HTMLElement
    expect(header.getAttribute('draggable')).toBe('true')
  })
})
