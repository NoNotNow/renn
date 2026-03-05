import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PropertyPanel from '@/components/PropertyPanel'
import { sampleWorld } from '@/data/sampleWorld'
import { createDefaultEntity } from '@/data/entityDefaults'
import type { RennWorld, Entity } from '@/types/world'

vi.mock('@/utils/uiLogger', () => ({
  uiLogger: { change: vi.fn(), delete: vi.fn(), click: vi.fn(), log: vi.fn(), select: vi.fn(), upload: vi.fn() },
}))

function worldWithBox(): RennWorld {
  const boxEntity = createDefaultEntity('box')
  return {
    version: '1.0',
    world: { camera: { control: 'free', mode: 'follow', target: boxEntity.id } },
    entities: [
      {
        ...boxEntity,
        position: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ],
  }
}

function worldWithCylinder(): RennWorld {
  const entity = createDefaultEntity('cylinder')
  return {
    version: '1.0',
    world: { camera: { control: 'free', mode: 'follow', target: entity.id } },
    entities: [
      {
        ...entity,
        position: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ],
  }
}

function worldWithSphere(): RennWorld {
  const entity = createDefaultEntity('sphere')
  return {
    version: '1.0',
    world: { camera: { control: 'free', mode: 'follow', target: 'ball' } },
    entities: [
      {
        ...entity,
        id: 'ball',
        name: 'ball',
        position: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ],
  }
}

function renderPropertyPanel(
  world: RennWorld,
  selectedEntityId: string | null,
  onWorldChange = vi.fn(),
  onDeleteEntity?: (id: string) => void,
  assets: Map<string, Blob> = new Map(),
  onRefreshFromPhysics?: (entityId: string) => void,
  livePoses?: Map<string, { position: [number, number, number]; rotation: [number, number, number] }> | null
) {
  return render(
    <PropertyPanel
      world={world}
      assets={assets}
      selectedEntityId={selectedEntityId}
      onWorldChange={onWorldChange}
      onDeleteEntity={onDeleteEntity}
      onRefreshFromPhysics={onRefreshFromPhysics}
      livePoses={livePoses}
    />
  )
}

describe('PropertyPanel', () => {
  it('shows "Select an entity" when no entity selected', () => {
    renderPropertyPanel(sampleWorld, null)
    expect(screen.getByText('Select an entity')).toBeInTheDocument()
  })

  it('does not show refresh-from-physics button when onRefreshFromPhysics is undefined', () => {
    const world = worldWithBox()
    renderPropertyPanel(world, world.entities[0].id)
    expect(screen.queryByTitle('Refresh position and rotation from physics')).not.toBeInTheDocument()
  })

  it('calls onRefreshFromPhysics with entity id when refresh button is clicked', async () => {
    const user = userEvent.setup()
    const onRefreshFromPhysics = vi.fn()
    const world = worldWithBox()
    const entityId = world.entities[0].id
    renderPropertyPanel(world, entityId, vi.fn(), undefined, new Map(), onRefreshFromPhysics)
    const refreshButton = screen.getByTitle('Refresh position and rotation from physics')
    await user.click(refreshButton)
    expect(onRefreshFromPhysics).toHaveBeenCalledTimes(1)
    expect(onRefreshFromPhysics).toHaveBeenCalledWith(entityId)
  })

  it('shows entity name and shape-specific inputs when box entity selected', () => {
    const world = worldWithBox()
    const entity = world.entities[0]
    const displayName = entity.name ?? entity.id
    renderPropertyPanel(world, entity.id)
    expect(screen.getByRole('heading', { name: displayName })).toBeInTheDocument()
    expect(screen.getByLabelText(/width/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/height/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/depth/i)).toBeInTheDocument()
  })

  it('shows shape-specific inputs for sphere when ball selected', () => {
    const world = worldWithSphere()
    renderPropertyPanel(world, 'ball')
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
    const updatedEntity = updatedWorld.entities.find((e: Entity) => e.id === entityId)
    expect(updatedEntity?.position).toEqual([1, 0, 0])
  })

  describe('inspector inputs', () => {
    it('changing Name updates entity name', async () => {
      const onWorldChange = vi.fn()
      const world = worldWithBox()
      const entityId = world.entities[0].id
      renderPropertyPanel(world, entityId, onWorldChange)
      const nameInput = screen.getByLabelText(/^name$/i)
      fireEvent.change(nameInput, { target: { value: 'My Box' } })
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

    it('changing Rotation X updates entity rotation', async () => {
      const user = userEvent.setup()
      const onWorldChange = vi.fn()
      const world = worldWithBox()
      const entityId = world.entities[0].id
      renderPropertyPanel(world, entityId, onWorldChange)
      const rotationXInput = screen.getByLabelText(/rotation x/i)
      await user.clear(rotationXInput)
      await user.type(rotationXInput, '0.5')
      expect(onWorldChange).toHaveBeenCalled()
      const lastCall = onWorldChange.mock.calls[onWorldChange.mock.calls.length - 1]
      const updatedEntity = lastCall[0].entities.find((e: { id: string }) => e.id === entityId)
      expect(updatedEntity?.rotation?.[0]).toBe(0.5)
    })

    it('changing Color updates entity material color', async () => {
      const onWorldChange = vi.fn()
      const world = worldWithBox()
      const entityId = world.entities[0].id
      renderPropertyPanel(world, entityId, onWorldChange)
      const colorInput = screen.getByLabelText(/material color/i)
      fireEvent.change(colorInput, { target: { value: '#ff0000' } })
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

  describe('livePoses (inspector polling)', () => {
    it('displays position and rotation from livePoses when provided for selected entity', () => {
      const world = worldWithBox()
      const entityId = world.entities[0].id
      const livePoses = new Map([
        [entityId, { position: [5, 10, 15] as [number, number, number], rotation: [0.1, 0.2, 0.3] as [number, number, number] }],
      ])
      renderPropertyPanel(world, entityId, vi.fn(), undefined, new Map(), undefined, livePoses)
      const positionXInput = screen.getByLabelText(/position x/i)
      const positionYInput = screen.getByLabelText(/position y/i)
      const rotationXInput = screen.getByLabelText(/rotation x/i)
      expect(positionXInput).toHaveValue(5)
      expect(positionYInput).toHaveValue(10)
      expect(rotationXInput).toHaveValue(0.1)
    })

    it('when livePoses is provided, user changing Position X still calls onWorldChange with user value (no update loop)', () => {
      const onWorldChange = vi.fn()
      const world = worldWithBox()
      const entityId = world.entities[0].id
      const livePoses = new Map([
        [entityId, { position: [5, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] }],
      ])
      renderPropertyPanel(world, entityId, onWorldChange, undefined, new Map(), undefined, livePoses)
      const positionXInput = screen.getByLabelText(/position x/i)
      fireEvent.change(positionXInput, { target: { value: '7' } })
      expect(onWorldChange).toHaveBeenCalled()
      const lastCall = onWorldChange.mock.calls[onWorldChange.mock.calls.length - 1]
      const updatedEntity = lastCall[0].entities.find((e: Entity) => e.id === entityId)
      expect(updatedEntity?.position).toEqual([7, 0, 0])
    })
  })

  describe('entity lock functionality', () => {
    it('shows lock indicator for locked entities', () => {
      const world = worldWithBox()
      world.entities[0].locked = true
      renderPropertyPanel(world, world.entities[0].id)
      expect(screen.getByRole('heading', { name: /🔒/ })).toBeInTheDocument()
    })

    it('shows locked button when entity is locked', () => {
      const world = worldWithBox()
      world.entities[0].locked = true
      renderPropertyPanel(world, world.entities[0].id)
      expect(screen.getByTitle('Unlock entity')).toBeInTheDocument()
    })

    it('shows unlocked button when entity is not locked', () => {
      const world = worldWithBox()
      renderPropertyPanel(world, world.entities[0].id)
      expect(screen.getByTitle('Lock entity')).toBeInTheDocument()
    })

    it('clicking lock button toggles lock state', async () => {
      const user = userEvent.setup()
      const onWorldChange = vi.fn()
      const world = worldWithBox()
      renderPropertyPanel(world, world.entities[0].id, onWorldChange)
      const lockButton = screen.getByTitle('Lock entity')
      await user.click(lockButton)
      expect(onWorldChange).toHaveBeenCalled()
      const lastCall = onWorldChange.mock.calls[onWorldChange.mock.calls.length - 1]
      const updatedEntity = lastCall[0].entities.find((e: { id: string }) => e.id === world.entities[0].id)
      expect(updatedEntity?.locked).toBe(true)
    })

    it('disables name input when entity is locked', () => {
      const world = worldWithBox()
      world.entities[0].locked = true
      renderPropertyPanel(world, world.entities[0].id)
      const nameInput = screen.getByLabelText(/^name$/i)
      expect(nameInput).toBeDisabled()
    })

    it('disables shape inputs when entity is locked', () => {
      const world = worldWithBox()
      world.entities[0].locked = true
      renderPropertyPanel(world, world.entities[0].id)
      expect(screen.getByLabelText(/shape/i)).toBeDisabled()
      expect(screen.getByLabelText(/width/i)).toBeDisabled()
      expect(screen.getByLabelText(/height/i)).toBeDisabled()
      expect(screen.getByLabelText(/depth/i)).toBeDisabled()
    })

    it('disables transform inputs when entity is locked', () => {
      const world = worldWithBox()
      world.entities[0].locked = true
      renderPropertyPanel(world, world.entities[0].id)
      expect(screen.getByLabelText(/position x/i)).toBeDisabled()
      expect(screen.getByLabelText(/position y/i)).toBeDisabled()
      expect(screen.getByLabelText(/position z/i)).toBeDisabled()
      expect(screen.getByLabelText(/scale x/i)).toBeDisabled()
      expect(screen.getByLabelText(/scale y/i)).toBeDisabled()
      expect(screen.getByLabelText(/scale z/i)).toBeDisabled()
    })

    it('disables physics inputs when entity is locked', () => {
      const world = worldWithBox()
      world.entities[0].locked = true
      renderPropertyPanel(world, world.entities[0].id)
      expect(screen.getByLabelText(/body type/i)).toBeDisabled()
      expect(screen.getByLabelText(/friction/i)).toBeDisabled()
    })

    it('disables material inputs when entity is locked', () => {
      const world = worldWithBox()
      world.entities[0].locked = true
      renderPropertyPanel(world, world.entities[0].id)
      expect(screen.getByLabelText(/material color/i)).toBeDisabled()
      expect(screen.getByLabelText(/roughness/i)).toBeDisabled()
      expect(screen.getByLabelText(/metalness/i)).toBeDisabled()
    })

    it('disables delete button when entity is locked', () => {
      const world = worldWithBox()
      world.entities[0].locked = true
      renderPropertyPanel(world, world.entities[0].id, vi.fn(), vi.fn())
      const deleteButton = screen.getByRole('button', { name: /delete entity/i })
      expect(deleteButton).toBeDisabled()
    })

    it('does not call onDeleteEntity when clicking delete on locked entity', async () => {
      const user = userEvent.setup()
      const onDeleteEntity = vi.fn()
      const world = worldWithBox()
      world.entities[0].locked = true
      renderPropertyPanel(world, world.entities[0].id, vi.fn(), onDeleteEntity)
      const deleteButton = screen.getByRole('button', { name: /delete entity/i })
      await user.click(deleteButton)
      expect(onDeleteEntity).not.toHaveBeenCalled()
    })
  })
})
