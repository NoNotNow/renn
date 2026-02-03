import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { forwardRef } from 'react'
import Builder from '@/pages/Builder'
import { ProjectProvider } from '@/contexts/ProjectContext'
import { updateEntityPosition } from '@/utils/worldUtils'
import { sampleWorld } from '@/data/sampleWorld'
import type { RennWorld, Vec3 } from '@/types/world'

const sceneViewProps: Record<string, unknown> = {}
vi.mock('@/components/SceneView', () => ({
  default: forwardRef((props: Record<string, unknown>, _ref) => {
    Object.assign(sceneViewProps, props)
    return <div data-testid="scene-view" />
  }),
}))

vi.mock('@/persistence/indexedDb', () => ({
  createIndexedDbPersistence: () => ({
    listProjects: vi.fn().mockResolvedValue([]),
    loadProject: vi.fn(),
    saveProject: vi.fn(),
    deleteProject: vi.fn(),
    exportProject: vi.fn(),
    importProject: vi.fn(),
  }),
}))

function renderBuilder() {
  return render(
    <MemoryRouter>
      <ProjectProvider>
        <Builder />
      </ProjectProvider>
    </MemoryRouter>
  )
}

describe('updateEntityPosition', () => {
  it('updates the target entity position and leaves others unchanged', () => {
    const world: RennWorld = {
      ...sampleWorld,
      entities: [
        { id: 'a', position: [0, 0, 0] },
        { id: 'b', position: [1, 1, 1] },
      ],
    }
    const newPos: Vec3 = [5, 10, 15]
    const result = updateEntityPosition(world, 'b', newPos)
    expect(result.entities[0].position).toEqual([0, 0, 0])
    expect(result.entities[1].position).toEqual(newPos)
  })

  it('returns a new world reference (immutable)', () => {
    const result = updateEntityPosition(sampleWorld, 'ball', [0, 3, 0])
    expect(result).not.toBe(sampleWorld)
    expect(result.entities).not.toBe(sampleWorld.entities)
    expect(sampleWorld.entities.find((e) => e.id === 'ball')?.position).toEqual([0, 2, 0])
  })

  it('leaves world unchanged when entityId is not found', () => {
    const result = updateEntityPosition(sampleWorld, 'nonexistent', [1, 2, 3])
    expect(result.entities).toHaveLength(sampleWorld.entities.length)
    result.entities.forEach((e, i) => {
      expect(e.id).toBe(sampleWorld.entities[i].id)
      expect(e.position).toEqual(sampleWorld.entities[i].position)
    })
  })
})

describe('Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(sceneViewProps).forEach((k) => delete sceneViewProps[k])
  })

  it('renders add entity dropdown and entity list', async () => {
    renderBuilder()
    await act(async () => {
      await Promise.resolve()
    })
    await userEvent.click(screen.getByRole('button', { name: 'entities' }))
    expect(screen.getByTitle('Add entity')).toBeInTheDocument()
    const entityList = screen.getByRole('list')
    expect(entityList).toBeInTheDocument()
    expect(entityList.children).toHaveLength(sampleWorld.entities.length)
  })

  it('adds entity when selecting "Add box" and selects the new entity', async () => {
    const user = userEvent.setup()
    renderBuilder()
    await user.click(screen.getByRole('button', { name: 'entities' }))
    const entityList = screen.getByRole('list')
    const initialCount = entityList.children.length

    const addSelect = screen.getByTitle('Add entity')
    await user.selectOptions(addSelect, 'box')

    await waitFor(() => {
      expect(entityList.children).toHaveLength(initialCount + 1)
    })
    const newEntityButton = screen.getByRole('button', { name: /^box [a-z]+ \d+$/ })
    expect(newEntityButton).toBeInTheDocument()
    expect(newEntityButton).toHaveStyle({ background: '#2b3550' })
  })

  it('passes editor props to SceneView: selectedEntityId, onSelectEntity, onEntityPositionChange', async () => {
    renderBuilder()
    await act(async () => {
      await Promise.resolve()
    })
    expect(sceneViewProps.selectedEntityId).toBe(null)
    expect(typeof sceneViewProps.onSelectEntity).toBe('function')
    expect(typeof sceneViewProps.onEntityPositionChange).toBe('function')
    expect(sceneViewProps.shadowsEnabled).toBe(true)
  })

  it('passes shadowsEnabled false to SceneView when Shadows switch is toggled off', async () => {
    const user = userEvent.setup()
    renderBuilder()
    await act(async () => {
      await Promise.resolve()
    })
    const shadowsSwitch = screen.getByRole('switch', { name: 'Shadows' })
    await user.click(shadowsSwitch)
    await waitFor(() => {
      expect(sceneViewProps.shadowsEnabled).toBe(false)
    })
  })

  it('passes selected entity id to SceneView when an entity is selected', async () => {
    const user = userEvent.setup()
    renderBuilder()
    await act(async () => {
      await Promise.resolve()
    })
    await user.click(screen.getByRole('button', { name: 'entities' }))
    const ballButton = screen.getByRole('button', { name: 'ball' })
    await user.click(ballButton)
    expect(sceneViewProps.selectedEntityId).toBe('ball')
  })
})
