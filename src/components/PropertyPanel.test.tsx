import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PropertyPanel from '@/components/PropertyPanel'
import { sampleWorld } from '@/data/sampleWorld'
import { createDefaultEntity } from '@/data/entityDefaults'
import type { RennWorld } from '@/types/world'

function worldWithBox(): RennWorld {
  const boxEntity = createDefaultEntity('box')
  return {
    version: '1.0',
    world: { camera: { mode: 'follow', target: boxEntity.id } },
    entities: [boxEntity],
  }
}

function renderPropertyPanel(world: RennWorld, selectedEntityId: string | null, onWorldChange = vi.fn(), onDeleteEntity?: (id: string) => void) {
  return render(
    <PropertyPanel
      world={world}
      selectedEntityId={selectedEntityId}
      onWorldChange={onWorldChange}
      onDeleteEntity={onDeleteEntity}
    />
  )
}

describe('PropertyPanel', () => {
  it('shows "Select an entity" when no entity selected', () => {
    renderPropertyPanel(sampleWorld, null)
    expect(screen.getByText('Select an entity')).toBeInTheDocument()
  })

  it('shows entity name and shape-specific inputs when box entity selected', () => {
    const world = worldWithBox()
    const entityId = world.entities[0].id
    renderPropertyPanel(world, entityId)
    expect(screen.getByRole('heading', { name: entityId })).toBeInTheDocument()
    expect(screen.getByLabelText(/width/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/height/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/depth/i)).toBeInTheDocument()
  })

  it('shows shape-specific inputs for sphere when ball selected', () => {
    renderPropertyPanel(sampleWorld, 'ball')
    expect(screen.getByRole('heading', { name: 'ball' })).toBeInTheDocument()
    expect(screen.getByLabelText(/radius/i)).toBeInTheDocument()
  })

  it('updating box width does not throw', async () => {
    const user = userEvent.setup()
    const onWorldChange = vi.fn()
    const world = worldWithBox()
    renderPropertyPanel(world, world.entities[0].id, onWorldChange)
    const widthInput = screen.getByLabelText(/width/i)
    await user.clear(widthInput)
    await user.type(widthInput, '2')
    expect(onWorldChange).toHaveBeenCalled()
  })
})
