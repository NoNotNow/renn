import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PropertyPanel from '@/components/PropertyPanel'
import { sampleWorld } from '@/data/sampleWorld'
import { createDefaultEntity } from '@/data/entityDefaults'
import type { RennWorld } from '@/types/world'

vi.mock('@/utils/uiLogger', () => ({
  uiLogger: { change: vi.fn(), delete: vi.fn(), click: vi.fn(), log: vi.fn(), select: vi.fn(), upload: vi.fn() },
}))

function worldWithBox(): RennWorld {
  const boxEntity = createDefaultEntity('box')
  return {
    version: '1.0',
    world: { camera: { mode: 'follow', target: boxEntity.id } },
    entities: [boxEntity],
  }
}

function worldWithCylinder(): RennWorld {
  const entity = createDefaultEntity('cylinder')
  return {
    version: '1.0',
    world: { camera: { mode: 'follow', target: entity.id } },
    entities: [entity],
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

  it('changing Position X calls onWorldChange with updated entity position', async () => {
    const user = userEvent.setup()
    const onWorldChange = vi.fn()
    const world = worldWithBox()
    const entityId = world.entities[0].id
    renderPropertyPanel(world, entityId, onWorldChange)
    const positionXInput = screen.getByLabelText(/position x/i)
    await user.clear(positionXInput)
    await user.type(positionXInput, '1')
    expect(onWorldChange).toHaveBeenCalled()
    const lastCall = onWorldChange.mock.calls[onWorldChange.mock.calls.length - 1]
    const updatedWorld = lastCall[0]
    const updatedEntity = updatedWorld.entities.find((e) => e.id === entityId)
    expect(updatedEntity?.position).toEqual([1, 0, 0])
  })

  describe('inspector inputs', () => {
    it('changing Name updates entity name', async () => {
      const user = userEvent.setup()
      const onWorldChange = vi.fn()
      const world = worldWithBox()
      const entityId = world.entities[0].id
      renderPropertyPanel(world, entityId, onWorldChange)
      const nameInput = screen.getByLabelText(/^name$/i)
      await user.clear(nameInput)
      await user.paste('My Box')
      expect(onWorldChange).toHaveBeenCalled()
      const lastCall = onWorldChange.mock.calls[onWorldChange.mock.calls.length - 1]
      const updatedEntity = lastCall[0].entities.find((e: { id: string }) => e.id === entityId)
      expect(updatedEntity?.name).toBe('My Box')
    })

    it('changing Shape type updates entity shape', async () => {
      const user = userEvent.setup()
      const onWorldChange = vi.fn()
      const world = worldWithBox()
      const entityId = world.entities[0].id
      renderPropertyPanel(world, entityId, onWorldChange)
      await user.selectOptions(screen.getByLabelText(/shape/i), 'sphere')
      expect(onWorldChange).toHaveBeenCalled()
      const lastCall = onWorldChange.mock.calls[onWorldChange.mock.calls.length - 1]
      const updatedEntity = lastCall[0].entities.find((e: { id: string }) => e.id === entityId)
      expect(updatedEntity?.shape?.type).toBe('sphere')
    })

    it('changing Body type updates entity bodyType', async () => {
      const user = userEvent.setup()
      const onWorldChange = vi.fn()
      const world = worldWithBox()
      const entityId = world.entities[0].id
      renderPropertyPanel(world, entityId, onWorldChange)
      await user.selectOptions(screen.getByLabelText(/body type/i), 'dynamic')
      expect(onWorldChange).toHaveBeenCalled()
      const lastCall = onWorldChange.mock.calls[onWorldChange.mock.calls.length - 1]
      const updatedEntity = lastCall[0].entities.find((e: { id: string }) => e.id === entityId)
      expect(updatedEntity?.bodyType).toBe('dynamic')
    })

    it('changing Friction updates entity friction', () => {
      const onWorldChange = vi.fn()
      const world = worldWithBox()
      const entityId = world.entities[0].id
      renderPropertyPanel(world, entityId, onWorldChange)
      const frictionInput = screen.getByLabelText(/friction/i)
      fireEvent.change(frictionInput, { target: { value: '0.8' } })
      expect(onWorldChange).toHaveBeenCalled()
      const lastCall = onWorldChange.mock.calls[onWorldChange.mock.calls.length - 1]
      const updatedEntity = lastCall[0].entities.find((e: { id: string }) => e.id === entityId)
      expect(updatedEntity?.friction).toBe(0.8)
    })

    it('changing Scale X updates entity scale', async () => {
      const user = userEvent.setup()
      const onWorldChange = vi.fn()
      const world = worldWithBox()
      const entityId = world.entities[0].id
      renderPropertyPanel(world, entityId, onWorldChange)
      const scaleXInput = screen.getByLabelText(/scale x/i)
      await user.tripleClick(scaleXInput)
      await user.keyboard('2')
      expect(onWorldChange).toHaveBeenCalled()
      const lastCall = onWorldChange.mock.calls[onWorldChange.mock.calls.length - 1]
      const updatedEntity = lastCall[0].entities.find((e: { id: string }) => e.id === entityId)
      expect(updatedEntity?.scale).toEqual([2, 1, 1])
    })

    it('changing Rotation (quat) x updates entity rotation', async () => {
      const user = userEvent.setup()
      const onWorldChange = vi.fn()
      const world = worldWithBox()
      const entityId = world.entities[0].id
      renderPropertyPanel(world, entityId, onWorldChange)
      const rotationXInput = screen.getByLabelText(/rotation \(quat\) x/i)
      await user.clear(rotationXInput)
      await user.type(rotationXInput, '0.5')
      expect(onWorldChange).toHaveBeenCalled()
      const lastCall = onWorldChange.mock.calls[onWorldChange.mock.calls.length - 1]
      const updatedEntity = lastCall[0].entities.find((e: { id: string }) => e.id === entityId)
      expect(updatedEntity?.rotation?.[0]).toBe(0.5)
    })

    it('changing Color R updates entity material color', async () => {
      const user = userEvent.setup()
      const onWorldChange = vi.fn()
      const world = worldWithBox()
      const entityId = world.entities[0].id
      renderPropertyPanel(world, entityId, onWorldChange)
      const colorRInput = screen.getByLabelText(/color \(r, g, b 0–1\) r/i)
      await user.tripleClick(colorRInput)
      await user.keyboard('1')
      expect(onWorldChange).toHaveBeenCalled()
      const lastCall = onWorldChange.mock.calls[onWorldChange.mock.calls.length - 1]
      const updatedEntity = lastCall[0].entities.find((e: { id: string }) => e.id === entityId)
      expect(updatedEntity?.material?.color?.[0]).toBe(1)
    })

    it('changing Roughness updates entity material', () => {
      const onWorldChange = vi.fn()
      const world = worldWithBox()
      const entityId = world.entities[0].id
      renderPropertyPanel(world, entityId, onWorldChange)
      const roughnessInput = screen.getByLabelText(/roughness/i)
      fireEvent.change(roughnessInput, { target: { value: '0.2' } })
      expect(onWorldChange).toHaveBeenCalled()
      const lastCall = onWorldChange.mock.calls[onWorldChange.mock.calls.length - 1]
      const updatedEntity = lastCall[0].entities.find((e: { id: string }) => e.id === entityId)
      expect(updatedEntity?.material?.roughness).toBe(0.2)
    })

    it('changing Metalness updates entity material', async () => {
      const user = userEvent.setup()
      const onWorldChange = vi.fn()
      const world = worldWithBox()
      const entityId = world.entities[0].id
      renderPropertyPanel(world, entityId, onWorldChange)
      const metalnessInput = screen.getByLabelText(/metalness/i)
      await user.clear(metalnessInput)
      await user.type(metalnessInput, '0.9')
      expect(onWorldChange).toHaveBeenCalled()
      const lastCall = onWorldChange.mock.calls[onWorldChange.mock.calls.length - 1]
      const updatedEntity = lastCall[0].entities.find((e: { id: string }) => e.id === entityId)
      expect(updatedEntity?.material?.metalness).toBe(0.9)
    })

    it('Delete entity button calls onDeleteEntity with entity id', async () => {
      const user = userEvent.setup()
      const onDeleteEntity = vi.fn()
      const world = worldWithBox()
      const entityId = world.entities[0].id
      renderPropertyPanel(world, entityId, vi.fn(), onDeleteEntity)
      await user.click(screen.getByRole('button', { name: /delete entity/i }))
      expect(onDeleteEntity).toHaveBeenCalledWith(entityId)
    })

    it('cylinder entity shows Radius and Height and changing Radius updates shape', () => {
      const onWorldChange = vi.fn()
      const world = worldWithCylinder()
      const entityId = world.entities[0].id
      renderPropertyPanel(world, entityId, onWorldChange)
      expect(screen.getByLabelText(/radius/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/height/i)).toBeInTheDocument()
      const radiusInput = screen.getByLabelText(/radius/i)
      fireEvent.change(radiusInput, { target: { value: '0.8' } })
      expect(onWorldChange).toHaveBeenCalled()
      const lastCall = onWorldChange.mock.calls[onWorldChange.mock.calls.length - 1]
      const updatedEntity = lastCall[0].entities.find((e: { id: string }) => e.id === entityId)
      expect(updatedEntity?.shape?.type).toBe('cylinder')
      expect((updatedEntity?.shape as { radius?: number })?.radius).toBe(0.8)
    })
  })
})
