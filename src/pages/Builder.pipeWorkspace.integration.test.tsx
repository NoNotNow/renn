import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { render, screen, waitFor, act, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { forwardRef, useImperativeHandle } from 'react'
import Builder from '@/pages/Builder'
import { ProjectProvider } from '@/contexts/ProjectContext'
import type { RennWorld } from '@/types/world'
import { getEntityPipeStack } from '@/utils/transformerPipeResolve'

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
  getCameraPose: vi.fn(() => ({
    position: [0, 0, 0],
    forward: [0, 0, -1],
    fovRadians: Math.PI / 3,
    aspect: 16 / 9,
  })),
  resetCamera: vi.fn(),
  applyDebugForce: vi.fn(),
  getMeshForEntity: vi.fn(() => null),
  getEntityTriangleCount: vi.fn(() => null),
  getAvatarFocusSnapshot: vi.fn(() => null),
  cycleActiveAvatar: vi.fn(),
}))

const sceneViewProps: Record<string, unknown> = {}

vi.mock('@monaco-editor/react', () => ({
  default: function MockMonacoEditor() {
    return <div data-testid="mock-monaco-editor" />
  },
}))

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
    loadGlobalBehaviorLibrary: vi.fn().mockResolvedValue({ transformers: {}, scripts: {} }),
    saveGlobalBehaviorLibrary: vi.fn().mockResolvedValue(undefined),
    listModelPresets: vi.fn().mockResolvedValue([]),
  }),
  defaultPersistence: {
    loadGlobalBehaviorLibrary: vi.fn().mockResolvedValue({ transformers: {}, scripts: {} }),
    saveGlobalBehaviorLibrary: vi.fn().mockResolvedValue(undefined),
    listModelPresets: vi.fn().mockResolvedValue([]),
  },
}))

function currentWorld(): RennWorld {
  return sceneViewProps.world as RennWorld
}

function entityByName(world: RennWorld, name: string) {
  return world.entities.find((e) => e.name === name)
}

function transformerTypesForEntity(world: RennWorld, entityId: string): string[] {
  const entity = world.entities.find((e) => e.id === entityId)
  return (entity?.transformers ?? [])
    .map((id) => world.transformers?.[id]?.type)
    .filter((t): t is string => Boolean(t))
}

function stackPipeNames(world: RennWorld, entityId: string): string[] {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return []
  return getEntityPipeStack(entity).map((b) => world.transformerPipes?.[b.pipeId]?.name ?? b.pipeId)
}

function renderBuilder() {
  return render(
    <MemoryRouter>
      <ProjectProvider>
        <Builder />
      </ProjectProvider>
    </MemoryRouter>,
  )
}

async function settleBuilder() {
  await act(async () => {
    await Promise.resolve()
  })
}

async function openEntitiesTab(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Entities' })).toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: 'Entities' }))
}

async function selectEntityByName(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name }))
}

async function openWorkspace(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('header-open-workspace'))
  await waitFor(() => expect(screen.getByTestId('workspace-panel')).toBeInTheDocument())
  await waitFor(() =>
    expect(screen.getByTestId('workspace-tab-transformers')).toHaveAttribute('aria-selected', 'true'),
  )
}

async function ensurePipeNavOpen() {
  if (!screen.queryByTestId('pipe-nav-sidebar')) {
    fireEvent.click(screen.getByTestId('pipe-nav-open'))
  }
  await waitFor(() => expect(screen.getByTestId('pipe-nav-sidebar')).toBeInTheDocument())
}

async function waitForPlayerCarPipeWrap() {
  await waitFor(() => {
    const car = entityByName(currentWorld(), 'Player Car')
    expect(car?.transformerPipeStack?.length).toBeGreaterThan(0)
    expect(Object.keys(currentWorld().transformerPipes ?? {}).length).toBeGreaterThan(0)
  })
}

async function addCustomTransformer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('pipe-focused-add-button'))
  await waitFor(() => expect(screen.getByTestId('add-transformer-preset-custom')).toBeInTheDocument())
  await user.click(screen.getByTestId('add-transformer-preset-custom'))
  await user.click(screen.getByTestId('add-transformer-add-preset'))
  await waitFor(() => expect(screen.getByTestId('transformer-horizontal-item-2')).toBeInTheDocument())
}

async function createStackSiblingPipe(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByTestId('pipe-focused-add-button'))
  await waitFor(() => expect(screen.getByTestId('pipe-add-tab-create_pipe')).toBeInTheDocument())
  await user.click(screen.getByTestId('pipe-add-tab-create_pipe'))
  const nameInput = screen.getByTestId('pipe-add-name-input')
  await user.clear(nameInput)
  await user.type(nameInput, name)
  await user.click(screen.getByTestId('pipe-add-create-pipe'))
}

async function addExistingPipe(
  user: ReturnType<typeof userEvent.setup>,
  pipeName: string,
  mode: 'linked' | 'copy',
) {
  await user.click(screen.getByTestId('pipe-focused-add-button'))
  await waitFor(() => expect(screen.getByTestId('pipe-add-tab-existing_pipe')).toBeInTheDocument())
  await user.click(screen.getByTestId('pipe-add-tab-existing_pipe'))
  const list = screen.getByTestId('pipe-add-existing-list')
  await user.click(within(list).getByRole('button', { name: pipeName }))
  await user.click(screen.getByTestId(mode === 'linked' ? 'pipe-add-link' : 'pipe-add-copy'))
}

async function switchWorkspaceEntity(user: ReturnType<typeof userEvent.setup>, entityName: string) {
  const picker = screen.getByTestId('workspace-shell-entity-search')
  await user.click(within(picker).getByTestId('workspace-shell-entity-search-label'))
  const input = within(picker).getByTestId('workspace-shell-entity-search-input')
  await user.clear(input)
  await user.type(input, entityName)
  const entity = entityByName(currentWorld(), entityName)
  expect(entity).toBeDefined()
  await user.click(within(picker).getByTestId(`workspace-shell-entity-search-result-${entity!.id}`))
  await waitFor(() =>
    expect(screen.getByTestId('workspace-shell-entity-search-label')).toHaveTextContent(entityName),
  )
}

function expandPipeTreeEntity(entityName: string) {
  const tree = screen.getByTestId('pipe-nav-tree')
  const entityRow = within(tree).getByText(entityName).closest('div')!
  if (within(tree).queryByText('Pipe1') == null) {
    fireEvent.click(entityRow)
  }
}

async function drillIntoPipeInTree(entityName: string, pipeName: string) {
  expandPipeTreeEntity(entityName)
  const tree = screen.getByTestId('pipe-nav-tree')
  await waitFor(() => expect(within(tree).getByText(pipeName)).toBeInTheDocument())
  fireEvent.click(within(tree).getByText(pipeName))
  await waitFor(() => expect(screen.getByTestId('transformer-horizontal-item-0')).toBeInTheDocument())
}

function selectEntityRootInPipeTree(entityName: string) {
  expandPipeTreeEntity(entityName)
  const tree = screen.getByTestId('pipe-nav-tree')
  fireEvent.click(within(tree).getByText(entityName))
}

function reorderHorizontalStage(fromIndex: number, toIndex: number) {
  const from = screen.getByTestId(`transformer-horizontal-item-${fromIndex}`)
  const to = screen.getByTestId(`transformer-horizontal-item-${toIndex}`)
  fireEvent.dragStart(from)
  fireEvent.dragOver(to)
  fireEvent.drop(to)
  fireEvent.dragEnd(from)
}

function reorderStackPipeInTree(dragPipeName: string, dropPipeName: string) {
  const tree = screen.getByTestId('pipe-nav-tree')
  const dragRow = within(tree).getByText(dragPipeName).closest('div')!
  const dropRow = within(tree).getByText(dropPipeName).closest('div')!
  fireEvent.dragStart(dragRow)
  fireEvent.dragOver(dropRow)
  fireEvent.drop(dropRow)
  fireEvent.dragEnd(dragRow)
}

describe('Builder pipe workspace integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const storage = new Map<string, string>([['rennTransformerPipeNavOpen', 'true']])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it(
    'new project → Player Car workspace: custom pipe, link/copy existing pipes, and local reorder',
    async () => {
      const user = userEvent.setup()
      renderBuilder()
      await settleBuilder()

      await openEntitiesTab(user)
      await selectEntityByName(user, 'Player Car')
      await waitFor(() => expect((sceneViewProps.selectedEntityIds as string[] | undefined)?.[0]).toBe('car'))

      await openWorkspace(user)
      await ensurePipeNavOpen()
      await waitForPlayerCarPipeWrap()

      const carId = entityByName(currentWorld(), 'Player Car')!.id
      const pipe1Name = currentWorld().transformerPipes?.[
        getEntityPipeStack(entityByName(currentWorld(), 'Player Car')!)[0]!.pipeId
      ]?.name
      expect(pipe1Name).toBe('Pipe1')

      await addCustomTransformer(user)
      await waitFor(() => {
        expect(transformerTypesForEntity(currentWorld(), carId)).toEqual(['input', 'car2', 'custom'])
      })

      await createStackSiblingPipe(user, 'AuxPipe')
      await waitFor(() => {
        expect(stackPipeNames(currentWorld(), carId)).toEqual(['Pipe1', 'AuxPipe'])
      })

      await switchWorkspaceEntity(user, 'Box 1')
      const boxId = entityByName(currentWorld(), 'Box 1')!.id
      await waitFor(() =>
        expect(getEntityPipeStack(entityByName(currentWorld(), 'Box 1')!).length).toBeGreaterThan(0),
      )

      await addExistingPipe(user, 'Pipe1', 'linked')
      await waitFor(() => {
        const stack = getEntityPipeStack(entityByName(currentWorld(), 'Box 1')!)
        expect(stack).toHaveLength(2)
        expect(stack[1]?.mode).toBeUndefined()
      })

      await addExistingPipe(user, 'AuxPipe', 'copy')
      await waitFor(() => {
        const stack = getEntityPipeStack(entityByName(currentWorld(), 'Box 1')!)
        expect(stack).toHaveLength(3)
        expect(stack[2]?.mode).toBe('copy')
        expect(currentWorld().transformerPipes?.[stack[2]!.pipeId]?.name).toBe('AuxPipe (copy)')
      })

      await switchWorkspaceEntity(user, 'Player Car')
      await drillIntoPipeInTree('Player Car', 'Pipe1')
      reorderHorizontalStage(2, 0)
      await waitFor(() => {
        expect(transformerTypesForEntity(currentWorld(), carId)).toEqual(['custom', 'input', 'car2'])
      })

      await switchWorkspaceEntity(user, 'Player Car')
      selectEntityRootInPipeTree('Player Car')
      expandPipeTreeEntity('Player Car')
      reorderStackPipeInTree('AuxPipe', 'Pipe1')
      await waitFor(() => {
        expect(stackPipeNames(currentWorld(), carId)).toEqual(['AuxPipe', 'Pipe1'])
      })

      const boxStack = stackPipeNames(currentWorld(), boxId)
      expect(boxStack).toHaveLength(3)
      expect(boxStack).toContain('Pipe1')
      expect(boxStack).toContain('AuxPipe (copy)')
      const boxLocalPipe = boxStack.find((name) => name !== 'Pipe1' && name !== 'AuxPipe (copy)')
      expect(boxLocalPipe).toMatch(/^Pipe\d+$/)
    },
    60_000,
  )

  it(
    'linked pipe stage reorder on one entity propagates to other linked instances',
    async () => {
      const user = userEvent.setup()
      renderBuilder()
      await settleBuilder()

      await openEntitiesTab(user)
      await selectEntityByName(user, 'Player Car')
      await openWorkspace(user)
      await ensurePipeNavOpen()
      await waitForPlayerCarPipeWrap()

      const carId = entityByName(currentWorld(), 'Player Car')!.id

      await addCustomTransformer(user)
      await createStackSiblingPipe(user, 'AuxPipe')

      await switchWorkspaceEntity(user, 'Box 1')
      const boxId = entityByName(currentWorld(), 'Box 1')!.id
      await waitFor(() =>
        expect(getEntityPipeStack(entityByName(currentWorld(), 'Box 1')!).length).toBeGreaterThan(0),
      )
      await addExistingPipe(user, 'Pipe1', 'linked')

      await switchWorkspaceEntity(user, 'Player Car')
      await drillIntoPipeInTree('Player Car', 'Pipe1')
      reorderHorizontalStage(2, 0)
      await waitFor(() => {
        expect(transformerTypesForEntity(currentWorld(), carId)).toEqual(['custom', 'input', 'car2'])
      })

      await switchWorkspaceEntity(user, 'Box 1')
      await waitFor(() => {
        const boxTypes = transformerTypesForEntity(currentWorld(), boxId)
        const carTypes = transformerTypesForEntity(currentWorld(), carId)
        expect(boxTypes.slice(0, 3)).toEqual(carTypes)
      })
    },
    60_000,
  )
})
