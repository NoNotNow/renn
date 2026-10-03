import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RennWorld } from '@/types/world'
import PipeNavTree from './PipeNavTree'

const world: RennWorld = {
  version: '1',
  world: {},
  entities: [{ id: 'e1', name: 'Buggy', transformers: ['a'], transformerPipeStack: [{ pipeId: 'root' }] }],
  transformers: { a: { type: 'custom', name: 'Stage A', code: '' } },
  transformerPipes: { root: { id: 'root', name: 'Root', stageIds: ['a'], stages: [], members: [{ kind: 'stage', stageId: 'a' }] } },
}

async function openMenu() {
  const user = userEvent.setup()
  render(
    <div>
      <button type="button">outside</button>
      <PipeNavTree world={world} entity={world.entities[0]!} focusPath={[]} selectedIndex={0} onSelectPath={() => {}} onContextAction={() => {}} />
    </div>,
  )
  await user.hover(screen.getByText('Root'))
  fireEvent.click(screen.getAllByTitle('More')[0]!)
  expect(screen.getByText('Add before')).toBeInTheDocument()
  return user
}

describe('tree row menu (Add before / after / child)', () => {
  it('closes when clicking anywhere else', async () => {
    const user = await openMenu()
    await user.click(screen.getByText('outside'))
    expect(screen.queryByText('Add before')).toBeNull()
  })

  it('closes on Escape', async () => {
    await openMenu()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Add before')).toBeNull()
  })

  it('closes when the More button is pressed again, and when another row is clicked', async () => {
    const user = await openMenu()
    fireEvent.click(screen.getAllByTitle('More')[0]!)
    expect(screen.queryByText('Add before')).toBeNull()
    fireEvent.click(screen.getAllByTitle('More')[0]!)
    expect(screen.getByText('Add before')).toBeInTheDocument()
    await user.click(screen.getByText('Buggy'))
    expect(screen.queryByText('Add before')).toBeNull()
  })

  it('stays open while clicking inside the menu', async () => {
    const user = await openMenu()
    fireEvent.pointerDown(screen.getByText('Add before').parentElement!)
    expect(screen.getByText('Add before')).toBeInTheDocument()
    await user.click(screen.getByText('Add before'))
    expect(screen.queryByText('Add before')).toBeNull() // picking an entry closes it
  })
})
