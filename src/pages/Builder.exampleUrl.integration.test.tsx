import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { forwardRef, useImperativeHandle } from 'react'
import Builder from '@/pages/Builder'
import { ProjectProvider } from '@/contexts/ProjectContext'
import { sampleWorld } from '@/data/sampleWorld'
import { readExampleWorldUrlState } from '@/utils/exampleWorldUrlParam'

/** Shareable example-world link: ?example=<id>&entity=<id>&tool=<gizmo mode> restores and follows the Builder view. */

const sceneViewRefMocks = vi.hoisted(() => ({
  setViewPreset: vi.fn(),
  updateEntityPose: vi.fn(),
  updateEntityPhysics: vi.fn(),
  updateEntityShape: vi.fn(() => false),
  updateEntityMaterial: vi.fn(() => Promise.resolve()),
  updateEntityModelTransform: vi.fn(),
  refreshEntityAppearance: vi.fn(),
  syncEntityTransformers: vi.fn(),
  setWorldPipeRegistry: vi.fn(),
  getAllPoses: vi.fn(() => new Map()),
  getCameraPose: vi.fn(() => ({ position: [0, 0, 0], forward: [0, 0, -1], fovRadians: Math.PI / 3, aspect: 16 / 9 })),
  resetCamera: vi.fn(),
  applyDebugForce: vi.fn(),
  getMeshForEntity: vi.fn(() => null),
  getEntityTriangleCount: vi.fn(() => null),
  getAvatarFocusSnapshot: vi.fn(() => null),
  cycleActiveAvatar: vi.fn(),
  syncWorldEntities: vi.fn(() => Promise.resolve()),
}))

const sceneViewProps: Record<string, unknown> = {}
vi.mock('@/components/SceneView', () => ({
  default: forwardRef(function MockSceneView(props: Record<string, unknown>, ref) {
    useImperativeHandle(ref, () => sceneViewRefMocks)
    Object.assign(sceneViewProps, props)
    return <div data-testid="scene-view" />
  }),
}))

vi.mock('@/components/PropertySidebar', () => ({
  default: function MockPropertySidebar() {
    return null
  },
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

const loadExample = vi.hoisted(() => vi.fn())
vi.mock('@/utils/loadExampleWorldFromPublicBase', () => ({ loadExampleWorldFromPublicBase: loadExample }))

function renderBuilder() {
  return render(
    <MemoryRouter>
      <ProjectProvider>
        <Builder />
      </ProjectProvider>
    </MemoryRouter>,
  )
}

function urlState() {
  return readExampleWorldUrlState(window.location.search)
}

describe('Builder example-world link', () => {
  beforeEach(() => {
    loadExample.mockReset()
    loadExample.mockResolvedValue({ world: sampleWorld, assets: new Map() })
    Object.keys(sceneViewProps).forEach((k) => delete sceneViewProps[k])
  })
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('restores the selected entity and tool from the URL', async () => {
    window.history.replaceState(null, '', '/?example=demo&entity=car&tool=visualize')
    renderBuilder()
    await waitFor(() => expect(sceneViewProps.selectedEntityIds).toEqual(['car']))
    expect(loadExample).toHaveBeenCalledWith(expect.any(String), 'demo')
    expect(sceneViewProps.gizmoMode).toBe('visualize')
    expect(urlState()).toEqual({ example: 'demo', entity: 'car', tool: 'visualize' })
  })

  it('drops an unknown entity and tool from the URL', async () => {
    window.history.replaceState(null, '', '/?example=demo&entity=nope&tool=hammer')
    renderBuilder()
    await waitFor(() => expect(urlState()).toEqual({ example: 'demo', entity: null, tool: 'translate' }))
    expect(sceneViewProps.selectedEntityIds).toEqual([])
  })

  it('writes the selection and tool into the URL as they change', async () => {
    const user = userEvent.setup({ delay: null })
    window.history.replaceState(null, '', '/?example=demo')
    renderBuilder()
    await waitFor(() => expect(urlState().tool).toBe('translate'))
    await user.click(screen.getByRole('button', { name: 'Entities' }))
    await user.click(screen.getByRole('button', { name: 'Player Car' }))
    await user.click(screen.getByTitle('Visualize custom transformer variables'))
    await waitFor(() => expect(urlState()).toEqual({ example: 'demo', entity: 'car', tool: 'visualize' }))
  })

  it('leaves the URL alone without an example id', async () => {
    window.history.replaceState(null, '', '/?a=1')
    renderBuilder()
    await act(async () => {
      await Promise.resolve()
    })
    expect(loadExample).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?a=1')
  })
})
