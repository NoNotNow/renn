import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AssignEntitiesDialog from '@/components/workspace/AssignEntitiesDialog'
import type { Entity } from '@/types/world'

const entities: Entity[] = [
  { id: 'player', name: 'Player', shape: { type: 'box', width: 1, height: 1, depth: 1 }, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  { id: 'enemy_a', name: 'Enemy', shape: { type: 'sphere', radius: 0.5 }, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  { id: 'crate_01', shape: { type: 'box', width: 1, height: 1, depth: 1 }, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
]

describe('AssignEntitiesDialog', () => {
  it('filters entities by search and shows selection count', async () => {
    const user = userEvent.setup()
    render(
      <AssignEntitiesDialog
        isOpen
        onClose={vi.fn()}
        title='Assign script "main"'
        entities={entities}
        initialSelection={new Set(['player'])}
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByTestId('assign-entities-count')).toHaveTextContent('1 selected')
    expect(screen.getByTestId('assign-entity-player')).toBeInTheDocument()
    expect(screen.getByTestId('assign-entity-enemy_a')).toBeInTheDocument()

    await user.type(screen.getByTestId('assign-entities-search-input'), 'enemy')
    expect(screen.getByTestId('assign-entity-enemy_a')).toBeInTheDocument()
    expect(screen.queryByTestId('assign-entity-player')).not.toBeInTheDocument()
  })

  it('calls onApply with updated selection', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(
      <AssignEntitiesDialog
        isOpen
        onClose={vi.fn()}
        title='Assign transformer "move"'
        entities={entities}
        initialSelection={new Set()}
        onApply={onApply}
      />,
    )

    await user.click(screen.getByTestId('assign-entity-crate_01'))
    await user.click(screen.getByTestId('assign-entities-apply'))

    expect(onApply).toHaveBeenCalledWith(new Set(['crate_01']))
  })

  it('renders subheaderExtra content', () => {
    render(
      <AssignEntitiesDialog
        isOpen
        onClose={vi.fn()}
        title='Assign pipe "pipe_a"'
        entities={entities}
        initialSelection={new Set()}
        onApply={vi.fn()}
        subheaderExtra={<div data-testid="pipe-mode-radios">Pipe mode</div>}
      />,
    )

    expect(screen.getByTestId('pipe-mode-radios')).toBeInTheDocument()
  })
})
