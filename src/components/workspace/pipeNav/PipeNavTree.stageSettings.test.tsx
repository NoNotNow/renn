import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RennWorld } from '@/types/world'
import PipeNavTree from './PipeNavTree'

const world: RennWorld = {
  version: '1',
  world: {},
  entities: [{ id: 'e1', name: 'Buggy', transformers: ['a', 'b'], transformerPipeStack: [{ pipeId: 'root' }] }],
  transformers: {
    a: { type: 'custom', name: 'Stage A', code: '' },
    b: { type: 'custom', name: 'Stage B', code: '', enabled: false },
  },
  transformerPipes: {
    root: {
      id: 'root',
      name: 'Root',
      stageIds: [],
      stages: [],
      members: [{ kind: 'pipe', pipeId: 'inner' }, { kind: 'stage', stageId: 'b' }],
    },
    inner: { id: 'inner', name: 'Inner', stageIds: ['a'], stages: [], members: [{ kind: 'stage', stageId: 'a' }] },
  },
}

describe('PipeNavTree stage rows have a settings bar', () => {
  it('offers settings and an enable switch on stage rows and reports the stage address', async () => {
    const user = userEvent.setup()
    const onConfigureStage = vi.fn()
    const onToggleStageEnabled = vi.fn()
    render(
      <PipeNavTree
        world={world}
        entity={world.entities[0]!}
        focusPath={[]}
        selectedIndex={0}
        onSelectPath={() => {}}
        onConfigureStage={onConfigureStage}
        onToggleStageEnabled={onToggleStageEnabled}
      />,
    )
    await user.click(screen.getByText('Root'))
    await user.hover(screen.getByText('Stage B'))

    fireEvent.click(screen.getByTitle('Stage settings'))
    expect(onConfigureStage).toHaveBeenCalledWith(
      [
        { kind: 'stack', index: 0 },
        { kind: 'member', pipeId: 'root', memberIndex: 1 },
      ],
      1,
      'b',
    )

    // stage B is disabled: the switch offers to enable it
    fireEvent.click(screen.getByTitle('Enable stage'))
    expect(onToggleStageEnabled).toHaveBeenCalledWith('b')
  })

  it('shows no stage controls when the host does not wire settings', async () => {
    const user = userEvent.setup()
    render(
      <PipeNavTree world={world} entity={world.entities[0]!} focusPath={[]} selectedIndex={0} onSelectPath={() => {}} />,
    )
    await user.click(screen.getByText('Root'))
    await user.hover(screen.getByText('Stage B'))
    expect(screen.queryByTitle('Stage settings')).toBeNull()
  })
})
