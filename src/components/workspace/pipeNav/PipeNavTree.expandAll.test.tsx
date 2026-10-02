import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { RennWorld } from '@/types/world'
import PipeNavTree from './PipeNavTree'

const world: RennWorld = {
  version: '1',
  world: {},
  entities: [{ id: 'e1', name: 'Buggy', transformers: ['a'], transformerPipeStack: [{ pipeId: 'root' }] }],
  transformers: { a: { type: 'custom', name: 'Stage A', code: '' } },
  transformerPipes: {
    root: { id: 'root', name: 'Root', stageIds: [], stages: [], members: [{ kind: 'pipe', pipeId: 'mid' }] },
    mid: { id: 'mid', name: 'Mid', stageIds: [], stages: [], members: [{ kind: 'pipe', pipeId: 'leaf' }] },
    leaf: { id: 'leaf', name: 'Leaf', stageIds: ['a'], stages: [], members: [{ kind: 'stage', stageId: 'a' }] },
  },
}

const renderTree = (onAddPipe?: () => void) =>
  render(
    <PipeNavTree
      world={world}
      entity={world.entities[0]!}
      focusPath={[]}
      selectedIndex={0}
      onSelectPath={() => {}}
      onAddPipe={onAddPipe}
    />,
  )

describe('PipeNavTree toolbar', () => {
  it('expands every nested pipe, then collapses back to the stack', () => {
    renderTree()
    expect(screen.getByText('Root')).toBeTruthy()
    expect(screen.queryByText('Mid')).toBeNull()

    fireEvent.click(screen.getByTestId('pipe-nav-tree-expand-all'))
    expect(screen.getByText('Mid')).toBeTruthy()
    expect(screen.getByText('Leaf')).toBeTruthy()
    expect(screen.getByText('Stage A')).toBeTruthy()

    fireEvent.click(screen.getByTestId('pipe-nav-tree-collapse-all'))
    expect(screen.getByText('Root')).toBeTruthy()
    expect(screen.queryByText('Mid')).toBeNull()
  })

  it('shows "+ Pipe" only when the host wires it', () => {
    const onAddPipe = vi.fn()
    const { unmount } = renderTree()
    expect(screen.queryByTestId('pipe-nav-tree-add-pipe')).toBeNull()
    unmount()
    renderTree(onAddPipe)
    fireEvent.click(screen.getByTestId('pipe-nav-tree-add-pipe'))
    expect(onAddPipe).toHaveBeenCalledOnce()
  })
})
