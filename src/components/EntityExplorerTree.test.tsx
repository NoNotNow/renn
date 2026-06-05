import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EntityExplorerTree, { computeGroupActionState } from './EntityExplorerTree'
import { CopyProvider } from '@/contexts/CopyContext'
import type { Entity, RennWorld } from '@/types/world'

function makeWorld(entities: Entity[], groups?: RennWorld['groups']): RennWorld {
  return { version: '1.0', world: {}, entities, ...(groups ? { groups } : {}) }
}

interface RenderArgs {
  world: RennWorld
  selectedEntityIds?: string[]
  selectedGroupIds?: string[]
  filterTo?: string[]
}

function renderTree(args: RenderArgs) {
  const handlers = {
    onSelectEntity: vi.fn(),
    onSelectGroup: vi.fn(),
    onCreateGroupFromSelection: vi.fn(),
    onUngroup: vi.fn(),
    onAddSelectedToGroup: vi.fn(),
    onRemoveSelectedFromGroup: vi.fn(),
    onToggleGroupCollapsed: vi.fn(),
    onRenameGroup: vi.fn(),
  }
  const visible = args.filterTo
    ? args.world.entities.filter((e) => args.filterTo!.includes(e.id))
    : args.world.entities
  render(
    <CopyProvider>
      <EntityExplorerTree
        world={args.world}
        visibleEntities={visible}
        selectedEntityIds={args.selectedEntityIds ?? []}
        selectedGroupIds={args.selectedGroupIds ?? []}
        emptyMessage="No entities"
        {...handlers}
      />
    </CopyProvider>,
  )
  return handlers
}

describe('EntityExplorerTree', () => {
  it('scrolls the selected entity row into view', () => {
    const scrollIntoView = vi.fn()
    const original = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    try {
      renderTree({
        world: makeWorld([
          { id: 'a', name: 'Alpha' },
          { id: 'b', name: 'Bravo' },
        ]),
        selectedEntityIds: ['b'],
      })
      expect(scrollIntoView).toHaveBeenCalled()
    } finally {
      HTMLElement.prototype.scrollIntoView = original
    }
  })

  it('renders a flat list when there are no groups', () => {
    renderTree({
      world: makeWorld([
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Bravo' },
      ]),
    })
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Bravo')).toBeInTheDocument()
  })

  it('renders a group header before its entity children', () => {
    renderTree({
      world: makeWorld(
        [
          { id: 'a', name: 'Alpha' },
          { id: 'b', name: 'Bravo' },
        ],
        [{ id: 'g1', name: 'Pair', memberIds: ['a', 'b'] }],
      ),
    })
    expect(screen.getByText('Pair')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Bravo')).toBeInTheDocument()
  })

  it('hides children when the group is collapsed', () => {
    renderTree({
      world: makeWorld(
        [{ id: 'a', name: 'Alpha' }],
        [{ id: 'g1', name: 'Folded', memberIds: ['a'], collapsed: true }],
      ),
    })
    expect(screen.getByText('Folded')).toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
  })

  it('toggles collapsed state via the caret button', async () => {
    const user = userEvent.setup()
    const handlers = renderTree({
      world: makeWorld(
        [{ id: 'a', name: 'Alpha' }],
        [{ id: 'g1', name: 'Pair', memberIds: ['a'] }],
      ),
    })
    await user.click(screen.getByLabelText('Collapse group'))
    expect(handlers.onToggleGroupCollapsed).toHaveBeenCalledWith('g1', true)
  })

  it('clicking a group calls onSelectGroup', async () => {
    const user = userEvent.setup()
    const handlers = renderTree({
      world: makeWorld(
        [{ id: 'a', name: 'Alpha' }],
        [{ id: 'g1', name: 'Pair', memberIds: ['a'] }],
      ),
    })
    await user.click(screen.getByText('Pair'))
    expect(handlers.onSelectGroup).toHaveBeenCalledWith('g1', expect.objectContaining({ additive: false }))
  })

  it('shift-click on a group replaces selection like a plain click', async () => {
    const user = userEvent.setup()
    const handlers = renderTree({
      world: makeWorld(
        [{ id: 'a', name: 'Alpha' }],
        [{ id: 'g1', name: 'Pair', memberIds: ['a'] }],
      ),
    })
    await user.keyboard('{Shift>}')
    await user.click(screen.getByText('Pair'))
    await user.keyboard('{/Shift}')
    expect(handlers.onSelectGroup).toHaveBeenCalledWith('g1', expect.objectContaining({ additive: false }))
  })

  it('shift-click on an entity requests range selection with ordered ids', async () => {
    const user = userEvent.setup()
    const handlers = renderTree({
      world: makeWorld([
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Bravo' },
        { id: 'c', name: 'Charlie' },
      ]),
    })
    await user.click(screen.getByText('Alpha'))
    await user.keyboard('{Shift>}')
    await user.click(screen.getByText('Charlie'))
    await user.keyboard('{/Shift}')
    expect(handlers.onSelectEntity).toHaveBeenLastCalledWith(
      'c',
      expect.objectContaining({
        range: true,
        additive: false,
        orderedVisibleEntityIds: ['a', 'b', 'c'],
      }),
    )
  })

  it('Group button is disabled with a single selection', () => {
    renderTree({
      world: makeWorld([{ id: 'a' }, { id: 'b' }]),
      selectedEntityIds: ['a'],
    })
    expect(screen.getByRole('button', { name: 'Group' })).toBeDisabled()
  })

  it('Group button is enabled with two selected entities', async () => {
    const user = userEvent.setup()
    const handlers = renderTree({
      world: makeWorld([{ id: 'a' }, { id: 'b' }]),
      selectedEntityIds: ['a', 'b'],
    })
    const btn = screen.getByRole('button', { name: 'Group' })
    expect(btn).not.toBeDisabled()
    await user.click(btn)
    expect(handlers.onCreateGroupFromSelection).toHaveBeenCalledTimes(1)
  })

  it('Ungroup button is enabled when one group (and no entities) is selected', async () => {
    const user = userEvent.setup()
    const handlers = renderTree({
      world: makeWorld(
        [{ id: 'a' }],
        [{ id: 'g1', memberIds: ['a'] }],
      ),
      selectedGroupIds: ['g1'],
    })
    const btn = screen.getByRole('button', { name: 'Ungroup' })
    expect(btn).not.toBeDisabled()
    await user.click(btn)
    expect(handlers.onUngroup).toHaveBeenCalledWith('g1')
  })

  it('Add to group is enabled when one group + one outside entity are selected', async () => {
    const user = userEvent.setup()
    const handlers = renderTree({
      world: makeWorld(
        [{ id: 'a' }, { id: 'b' }],
        [{ id: 'g1', memberIds: ['a'] }],
      ),
      selectedEntityIds: ['b'],
      selectedGroupIds: ['g1'],
    })
    const btn = screen.getByRole('button', { name: 'Add to group' })
    expect(btn).not.toBeDisabled()
    await user.click(btn)
    expect(handlers.onAddSelectedToGroup).toHaveBeenCalledWith('g1')
  })

  it('Add to group is disabled when the only selected entity is already a member', () => {
    renderTree({
      world: makeWorld(
        [{ id: 'a' }],
        [{ id: 'g1', memberIds: ['a'] }],
      ),
      selectedEntityIds: ['a'],
      selectedGroupIds: ['g1'],
    })
    expect(screen.getByRole('button', { name: 'Add to group' })).toBeDisabled()
  })

  it('Remove from group is enabled when at least one selected entity has a parent group', async () => {
    const user = userEvent.setup()
    const handlers = renderTree({
      world: makeWorld(
        [{ id: 'a' }],
        [{ id: 'g1', memberIds: ['a'] }],
      ),
      selectedEntityIds: ['a'],
    })
    const btn = screen.getByRole('button', { name: 'Remove from group' })
    expect(btn).not.toBeDisabled()
    await user.click(btn)
    expect(handlers.onRemoveSelectedFromGroup).toHaveBeenCalledTimes(1)
  })

  it('shows the empty message when no rows render', () => {
    renderTree({ world: makeWorld([]) })
    expect(screen.getByText('No entities')).toBeInTheDocument()
  })

  it('hides a group whose visible-entity descendants are all filtered out', () => {
    renderTree({
      world: makeWorld(
        [{ id: 'a' }, { id: 'b' }],
        [{ id: 'g1', name: 'Hidden', memberIds: ['a', 'b'] }],
      ),
      filterTo: [], // filter all entities away
    })
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
  })

  it('renders the group with member-count badge', () => {
    renderTree({
      world: makeWorld(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        [{ id: 'g1', name: 'Trio', memberIds: ['a', 'b', 'c'] }],
      ),
    })
    const groupBtn = screen.getByText('Trio').closest('button')!
    expect(within(groupBtn).getByText('3')).toBeInTheDocument()
  })
})

describe('computeGroupActionState', () => {
  const w = (entities: Entity[], groups?: RennWorld['groups']): RennWorld => makeWorld(entities, groups)

  it('refuses to create a group with fewer than two members', () => {
    const s = computeGroupActionState(w([{ id: 'a' }]), ['a'], [])
    expect(s.canCreate).toBe(false)
  })

  it('allows creating a group with two entities', () => {
    const s = computeGroupActionState(w([{ id: 'a' }, { id: 'b' }]), ['a', 'b'], [])
    expect(s.canCreate).toBe(true)
  })

  it('refuses to add when the entity is already a direct member of the target group', () => {
    const s = computeGroupActionState(
      w([{ id: 'a' }], [{ id: 'g1', memberIds: ['a'] }]),
      ['a'],
      ['g1'],
    )
    expect(s.canAddToGroup).toBe(false)
  })
})
