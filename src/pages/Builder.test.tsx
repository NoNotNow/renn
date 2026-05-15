import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { forwardRef, useImperativeHandle } from 'react'
import Builder from '@/pages/Builder'
import { ProjectProvider } from '@/contexts/ProjectContext'
import { updateEntityPosition } from '@/utils/worldUtils'
import { sampleWorld } from '@/data/sampleWorld'
import type { RennWorld, Vec3, CameraMode } from '@/types/world'
import { cycleCameraMode } from '@/types/world'

/** Minimal SceneViewHandle stub so Builder ref calls do not throw in tests. */
const sceneViewRefMocks = vi.hoisted(() => ({
  setViewPreset: vi.fn(),
  updateEntityPose: vi.fn(),
  updateEntityPhysics: vi.fn(),
  updateEntityShape: vi.fn(() => false),
  updateEntityMaterial: vi.fn(() => Promise.resolve()),
  updateEntityModelTransform: vi.fn(),
  refreshEntityAppearance: vi.fn(),
  syncEntityTransformers: vi.fn(),
  getAllPoses: vi.fn(() => null),
  resetCamera: vi.fn(),
  applyDebugForce: vi.fn(),
  getMeshForEntity: vi.fn(() => null),
  getEntityTriangleCount: vi.fn(() => null),
  getAvatarFocusSnapshot: vi.fn(() => null),
  cycleActiveAvatar: vi.fn(),
}))

const sceneViewProps: Record<string, unknown> = {}
vi.mock('@/components/SceneView', () => ({
  default: forwardRef(function MockSceneView(props: Record<string, unknown>, ref) {
    useImperativeHandle(ref, () => sceneViewRefMocks)
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
    savePlaySessionWorld: vi.fn().mockResolvedValue(undefined),
    loadPlaySessionWorld: vi.fn().mockResolvedValue(null),
    loadAllAssets: vi.fn().mockResolvedValue(new Map()),
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

async function openEntitiesTab(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(
    () => expect(screen.getByRole('button', { name: /entities/i })).toBeInTheDocument(),
    { timeout: 3000 }
  )
  const entitiesButton = screen.getByRole('button', { name: /entities/i })
  await user.click(entitiesButton)
}

async function openWorldTab(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(
    () => expect(screen.getByRole('button', { name: /world/i })).toBeInTheDocument(),
    { timeout: 3000 },
  )
  await user.click(screen.getByRole('button', { name: /world/i }))
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
    const worldWithBall: RennWorld = {
      version: '1.0',
      world: {},
      entities: [
        { id: 'ball', position: [0, 2, 0] },
        { id: 'other', position: [1, 1, 1] },
      ],
    }
    const result = updateEntityPosition(worldWithBall, 'ball', [0, 3, 0])
    expect(result).not.toBe(worldWithBall)
    expect(result.entities).not.toBe(worldWithBall.entities)
    expect(result.entities.find((e) => e.id === 'ball')?.position).toEqual([0, 3, 0])
    expect(worldWithBall.entities.find((e) => e.id === 'ball')?.position).toEqual([0, 2, 0])
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
    if (typeof localStorage?.removeItem === 'function') {
      localStorage.removeItem('builderShowGameHud')
    }
  })

  it('renders add entity dropdown and entity list', async () => {
    const user = userEvent.setup()
    renderBuilder()
    await act(async () => {
      await Promise.resolve()
    })
    await openEntitiesTab(user)
    expect(screen.getByTitle('Add entity')).toBeInTheDocument()
    const entityList = screen.getByRole('tree', { name: 'Entity explorer' })
    expect(entityList).toBeInTheDocument()
    expect(entityList.children).toHaveLength(sampleWorld.entities.length)
  })

  it('adds entity when selecting "Add box" and selects the new entity', async () => {
    const user = userEvent.setup()
    renderBuilder()
    await openEntitiesTab(user)
    const entityList = screen.getByRole('tree', { name: 'Entity explorer' })
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

  it('passes editor props to SceneView: selectedEntityIds, onSelectEntity, onEntityPoseCommit, gizmoMode', async () => {
    const user = userEvent.setup()
    renderBuilder()
    await act(async () => {
      await Promise.resolve()
    })
    expect(sceneViewProps.selectedEntityIds).toEqual([])
    expect(typeof sceneViewProps.onSelectEntity).toBe('function')
    expect(typeof sceneViewProps.onEntityPoseCommit).toBe('function')
    expect(typeof sceneViewProps.onTexturePaintStrokeEnd).toBe('function')
    expect(typeof sceneViewProps.pushUndoBeforePaintStroke).toBe('function')
    expect(typeof sceneViewProps.getPaintTargetAssetId).toBe('function')
    expect(sceneViewProps.textureBrushRgb).toEqual([0.12, 0.12, 0.14])
    expect(sceneViewProps.textureBrushRadiusPx).toBe(6)
    expect(sceneViewProps.gizmoMode).toBe('translate')
    expect((sceneViewProps.world as RennWorld).world.shadowsEnabled).not.toBe(false)
    expect(sceneViewProps.showGameHud).toBe(false)
    expect(screen.getByRole('group', { name: 'Gizmo mode' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Rotate gizmo' }))
    expect(sceneViewProps.gizmoMode).toBe('rotate')
    await user.click(screen.getByRole('button', { name: 'Scale gizmo' }))
    expect(sceneViewProps.gizmoMode).toBe('scale')
  })

  it('passes showGameHud true to SceneView after View → Game HUD', async () => {
    const user = userEvent.setup()
    renderBuilder()
    await act(async () => {
      await Promise.resolve()
    })
    expect(sceneViewProps.showGameHud).toBe(false)
    await user.click(screen.getByRole('button', { name: 'View' }))
    await user.click(screen.getByRole('menuitem', { name: /game hud/i }))
    await waitFor(() => {
      expect(sceneViewProps.showGameHud).toBe(true)
    })
  })

  it('persists shadowsEnabled false on world when Shadows is toggled off in World panel', async () => {
    const user = userEvent.setup()
    renderBuilder()
    await act(async () => {
      await Promise.resolve()
    })
    await openWorldTab(user)
    const shadowsCheckbox = screen.getByLabelText('Shadows')
    await user.click(shadowsCheckbox)
    await waitFor(() => {
      expect((sceneViewProps.world as RennWorld).world.shadowsEnabled).toBe(false)
    })
  })

  it('passes selected entity id to SceneView when an entity is selected', async () => {
    const user = userEvent.setup()
    renderBuilder()
    await act(async () => {
      await Promise.resolve()
    })
    await openEntitiesTab(user)
    const carButton = screen.getByRole('button', { name: 'Player Car' })
    await user.click(carButton)
    expect(sceneViewProps.selectedEntityIds).toEqual(['car'])
  })

  it('renders and opens the Sound tab in the left sidebar', async () => {
    const user = userEvent.setup()
    renderBuilder()
    await act(async () => {
      await Promise.resolve()
    })
    const soundTab = screen.getByRole('button', { name: /sound/i })
    expect(soundTab).toBeInTheDocument()
    await user.click(soundTab)
    expect(screen.getByText('Background Sound')).toBeInTheDocument()
    expect(screen.getByLabelText('Audio')).toBeInTheDocument()
  })

  it('cycles camera mode when Digit0 is pressed (Camera tab, follow control)', async () => {
    renderBuilder()
    await act(async () => {
      await Promise.resolve()
    })
    const modeSelect = screen.getByLabelText('Mode') as HTMLSelectElement
    const initial = modeSelect.value as CameraMode

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit0', bubbles: true }))
    })
    expect(modeSelect.value).toBe(cycleCameraMode(initial))

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Numpad0', bubbles: true }))
    })
    expect(modeSelect.value).toBe(cycleCameraMode(cycleCameraMode(initial)))
  })

  it('calls SceneView cycleActiveAvatar when Digit1 or Numpad1 is pressed', async () => {
    sceneViewRefMocks.cycleActiveAvatar.mockReturnValue(true)
    renderBuilder()
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', bubbles: true }))
    })
    expect(sceneViewRefMocks.cycleActiveAvatar).toHaveBeenCalledTimes(1)

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Numpad1', bubbles: true }))
    })
    expect(sceneViewRefMocks.cycleActiveAvatar).toHaveBeenCalledTimes(2)
  })
})
