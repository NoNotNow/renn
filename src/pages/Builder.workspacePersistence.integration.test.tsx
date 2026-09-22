import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { render, screen, waitFor, act, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { forwardRef, useImperativeHandle, useEffect, useState } from 'react'
import Builder from '@/pages/Builder'
import { ProjectProvider } from '@/contexts/ProjectContext'
import type { RennWorld } from '@/types/world'
import {
  clearWorkspaceEditorViewStateStoreForTests,
  loadWorkspaceEditorViewState,
  type WorkspaceEditorViewState,
} from '@/utils/workspaceEditorViewState'
import { clearWorkspaceEditorDraftStoreForTests } from '@/utils/workspaceEditorDraft'
import { workspaceEditorItemKey } from '@/utils/workspaceEditorItemKey'

function viewStateScrollTop(state: WorkspaceEditorViewState | undefined): number | undefined {
  return (state as { scrollTop?: number } | undefined)?.scrollTop
}

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

const monacoHarness = vi.hoisted(() => ({
  activeItemKey: null as string | null,
  scrollTop: 0,
  lineNumber: 1,
  column: 1,
}))

vi.mock('@monaco-editor/react', () => ({
  default: function MockMonacoEditor() {
    return <div data-testid="mock-monaco-editor" />
  },
}))

vi.mock('@/components/TransformerCustomCodeEditor', () => ({
  default: function MockTransformerCustomCodeEditor({
    value,
    onEditorReady,
  }: {
    value: string
    onEditorReady?: (ed: {
      saveViewState: () => {
        scrollTop: number
        scrollLeft: number
        firstPosition: { lineNumber: number; column: number }
        lastPosition: { lineNumber: number; column: number }
      }
      restoreViewState: (state: {
        scrollTop?: number
        firstPosition?: { lineNumber: number; column: number }
      }) => void
      onDidChangeCursorPosition: (cb: () => void) => { dispose: () => void }
      onDidScrollChange: (cb: () => void) => { dispose: () => void }
      onDidDispose: (cb: () => void) => { dispose: () => void }
    }) => void
  }) {
    const [scroll, setScroll] = useState(monacoHarness.scrollTop)
    const [line, setLine] = useState(monacoHarness.lineNumber)

    useEffect(() => {
      const editor = {
        getScrollTop: () => monacoHarness.scrollTop,
        setScrollTop: (n: number) => {
          monacoHarness.scrollTop = n
          setScroll(n)
        },
        getPosition: () => ({ lineNumber: monacoHarness.lineNumber, column: monacoHarness.column }),
        setPosition: (pos: { lineNumber: number; column: number }) => {
          monacoHarness.lineNumber = pos.lineNumber
          monacoHarness.column = pos.column
          setLine(pos.lineNumber)
        },
        saveViewState: () => ({
          scrollTop: monacoHarness.scrollTop,
          scrollLeft: 0,
          firstPosition: { lineNumber: monacoHarness.lineNumber, column: monacoHarness.column },
          lastPosition: { lineNumber: monacoHarness.lineNumber, column: monacoHarness.column },
        }),
        restoreViewState: (state: {
          scrollTop?: number
          firstPosition?: { lineNumber: number; column: number }
        }) => {
          if (state.scrollTop != null) {
            monacoHarness.scrollTop = state.scrollTop
            setScroll(state.scrollTop)
          }
          if (state.firstPosition) {
            monacoHarness.lineNumber = state.firstPosition.lineNumber
            monacoHarness.column = state.firstPosition.column
            setLine(state.firstPosition.lineNumber)
          }
        },
        onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
        onDidScrollChange: vi.fn(() => ({ dispose: vi.fn() })),
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
      }
      onEditorReady?.(editor)
      // Mount-only: Workspace keeps a stable onEditorReady callback via useCallback.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
      <div
        data-testid="mock-monaco-editor"
        data-monaco-value={value}
        data-monaco-scroll={String(scroll)}
        data-monaco-line={String(line)}
        data-monaco-item-key={monacoHarness.activeItemKey ?? ''}
      />
    )
  },
  CUSTOM_CODE_EDITOR_HEIGHT_DEFAULT_PX: 280,
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

function customTransformerId(world: RennWorld, entityId: string): string | undefined {
  const entity = world.entities.find((e) => e.id === entityId)
  return entity?.transformers?.find((id) => world.transformers?.[id]?.type === 'custom')
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
}

async function closeWorkspace(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('workspace-close'))
  await waitFor(() => expect(screen.queryByTestId('workspace-panel')).not.toBeInTheDocument())
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
  })
}

async function addCustomTransformer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('pipe-focused-add-button'))
  await waitFor(() => expect(screen.getByTestId('add-transformer-preset-custom')).toBeInTheDocument())
  await user.click(screen.getByTestId('add-transformer-preset-custom'))
  await user.click(screen.getByTestId('add-transformer-add-preset'))
  await waitFor(() => expect(screen.getByTestId('transformer-horizontal-item-2')).toBeInTheDocument())
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

function monacoEl() {
  return screen.getByTestId('mock-monaco-editor')
}

describe('Builder workspace persistence integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearWorkspaceEditorViewStateStoreForTests()
    clearWorkspaceEditorDraftStoreForTests()
    monacoHarness.activeItemKey = null
    monacoHarness.scrollTop = 0
    monacoHarness.lineNumber = 1
    monacoHarness.column = 1

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
    'close and reopen workspace restores pipe depth and selected custom transformer',
    async () => {
      const user = userEvent.setup()
      renderBuilder()
      await settleBuilder()

      await openEntitiesTab(user)
      await selectEntityByName(user, 'Player Car')
      await openWorkspace(user)
      await ensurePipeNavOpen()
      await waitForPlayerCarPipeWrap()

      await addCustomTransformer(user)
      await drillIntoPipeInTree('Player Car', 'Pipe1')

      const carId = entityByName(currentWorld(), 'Player Car')!.id
      const customId = customTransformerId(currentWorld(), carId)
      expect(customId).toBeDefined()

      fireEvent.click(screen.getByTestId('transformer-horizontal-item-2'))
      await waitFor(() => {
        expect(monacoEl().getAttribute('data-monaco-value')).toContain('return {')
      })

      await closeWorkspace(user)
      await openWorkspace(user)
      await ensurePipeNavOpen()

      await waitFor(() => {
        expect(screen.getByTestId('transformer-horizontal-item-2')).toBeInTheDocument()
        expect(monacoEl().getAttribute('data-monaco-value')).toContain('return {')
      })

      const tree = screen.getByTestId('pipe-nav-tree')
      expect(within(tree).getByText('Pipe1')).toBeInTheDocument()
      expect(screen.getByTestId('transformer-horizontal-item-0')).toBeInTheDocument()
    },
    60_000,
  )

  it(
    'clicking a transformer card body selects it for Monaco editing',
    async () => {
      const user = userEvent.setup()
      renderBuilder()
      await settleBuilder()

      await openEntitiesTab(user)
      await selectEntityByName(user, 'Player Car')
      await openWorkspace(user)
      await ensurePipeNavOpen()
      await waitForPlayerCarPipeWrap()
      await addCustomTransformer(user)
      await drillIntoPipeInTree('Player Car', 'Pipe1')

      fireEvent.click(screen.getByTestId('transformer-horizontal-item-2'))
      await waitFor(() => {
        expect(monacoEl().getAttribute('data-monaco-value')).toContain('return {')
      })
    },
    60_000,
  )

  it(
    'clicking a pipe row in the tree selects the first custom stage and opens its code',
    async () => {
      const user = userEvent.setup()
      renderBuilder()
      await settleBuilder()

      await openEntitiesTab(user)
      await selectEntityByName(user, 'Player Car')
      await openWorkspace(user)
      await ensurePipeNavOpen()
      await waitForPlayerCarPipeWrap()
      await addCustomTransformer(user)

      expandPipeTreeEntity('Player Car')
      const tree = screen.getByTestId('pipe-nav-tree')
      await waitFor(() => expect(within(tree).getByText('Pipe1')).toBeInTheDocument())
      fireEvent.click(within(tree).getByText('Pipe1'))

      await waitFor(() => {
        expect(monacoEl().getAttribute('data-monaco-value')).toContain('return {')
      })
    },
    60_000,
  )

  it(
    'restores Monaco scroll and cursor when switching between custom transformers',
    async () => {
      const user = userEvent.setup()
      renderBuilder()
      await settleBuilder()

      await openEntitiesTab(user)
      await selectEntityByName(user, 'Player Car')
      await openWorkspace(user)
      await ensurePipeNavOpen()
      await waitForPlayerCarPipeWrap()
      await drillIntoPipeInTree('Player Car', 'Pipe1')
      await addCustomTransformer(user)
      await addCustomTransformer(user)

      const carId = entityByName(currentWorld(), 'Player Car')!.id
      const customIds = (entityByName(currentWorld(), 'Player Car')?.transformers ?? []).filter(
        (id) => currentWorld().transformers?.[id]?.type === 'custom',
      )
      expect(customIds.length).toBeGreaterThanOrEqual(2)
      const firstCustomId = customIds[0]!
      const secondCustomId = customIds[1]!
      const stackPath = [{ kind: 'stack' as const, index: 0 }]

      fireEvent.click(screen.getByTestId('transformer-horizontal-item-2'))
      await waitFor(() => {
        expect(monacoEl().getAttribute('data-monaco-value')).toContain('return {')
      })

      monacoHarness.scrollTop = 240
      monacoHarness.lineNumber = 12

      fireEvent.click(screen.getByTestId('transformer-horizontal-item-3'))
      await waitFor(() => {
        expect(monacoEl().getAttribute('data-monaco-value')).toContain('return {')
      })

      const editorKey = workspaceEditorItemKey({
        entityId: carId,
        tab: 'transformers',
        itemId: firstCustomId,
        pipeNavPath: stackPath,
      })!
      expect(viewStateScrollTop(loadWorkspaceEditorViewState(editorKey))).toBe(240)

      fireEvent.click(screen.getByTestId('transformer-horizontal-item-2'))
      await waitFor(() => {
        expect(monacoEl().getAttribute('data-monaco-scroll')).toBe('240')
        expect(monacoEl().getAttribute('data-monaco-line')).toBe('12')
      })
      expect(viewStateScrollTop(loadWorkspaceEditorViewState(
        workspaceEditorItemKey({
          entityId: carId,
          tab: 'transformers',
          itemId: secondCustomId,
          pipeNavPath: stackPath,
        })!,
      ))).toBe(0)
    },
    60_000,
  )

  it(
    'close and reopen workspace restores Monaco scroll and cursor for the same transformer',
    async () => {
      const user = userEvent.setup()
      renderBuilder()
      await settleBuilder()

      await openEntitiesTab(user)
      await selectEntityByName(user, 'Player Car')
      await openWorkspace(user)
      await ensurePipeNavOpen()
      await waitForPlayerCarPipeWrap()
      await addCustomTransformer(user)
      await drillIntoPipeInTree('Player Car', 'Pipe1')

      fireEvent.click(screen.getByTestId('transformer-horizontal-item-2'))
      await waitFor(() => {
        expect(monacoEl().getAttribute('data-monaco-value')).toContain('return {')
      })

      monacoHarness.scrollTop = 320
      monacoHarness.lineNumber = 15
      monacoHarness.column = 4

      await closeWorkspace(user)
      await openWorkspace(user)

      await waitFor(() => {
        expect(monacoEl().getAttribute('data-monaco-scroll')).toBe('320')
        expect(monacoEl().getAttribute('data-monaco-line')).toBe('15')
      })

      const carId = entityByName(currentWorld(), 'Player Car')!.id
      const customId = customTransformerId(currentWorld(), carId)
      const editorKey = workspaceEditorItemKey({
        entityId: carId,
        tab: 'transformers',
        itemId: customId,
        pipeNavPath: [{ kind: 'stack', index: 0 }],
      })!
      expect(viewStateScrollTop(loadWorkspaceEditorViewState(editorKey))).toBe(320)
    },
    60_000,
  )

  it(
    'entity switch in workspace restores each entity pipe depth and selection',
    async () => {
      const user = userEvent.setup()
      renderBuilder()
      await settleBuilder()

      await openEntitiesTab(user)
      await selectEntityByName(user, 'Player Car')
      await openWorkspace(user)
      await ensurePipeNavOpen()
      await waitForPlayerCarPipeWrap()
      await addCustomTransformer(user)
      await drillIntoPipeInTree('Player Car', 'Pipe1')
      fireEvent.click(screen.getByTestId('transformer-horizontal-item-2'))

      const picker = screen.getByTestId('workspace-shell-entity-search')
      await user.click(within(picker).getByTestId('workspace-shell-entity-search-label'))
      const input = within(picker).getByTestId('workspace-shell-entity-search-input')
      await user.clear(input)
      await user.type(input, 'Box 1')
      const box = entityByName(currentWorld(), 'Box 1')!
      await user.click(within(picker).getByTestId(`workspace-shell-entity-search-result-${box.id}`))

      await waitFor(() =>
        expect(screen.getByTestId('workspace-shell-entity-search-label')).toHaveTextContent('Box 1'),
      )

      await switchBackToPlayerCar(user)

      await waitFor(() => {
        expect(screen.getByTestId('transformer-horizontal-item-2')).toBeInTheDocument()
        expect(monacoEl().getAttribute('data-monaco-value')).toContain('return {')
      })
    },
    60_000,
  )
})

async function switchBackToPlayerCar(user: ReturnType<typeof userEvent.setup>) {
  const picker = screen.getByTestId('workspace-shell-entity-search')
  await user.click(within(picker).getByTestId('workspace-shell-entity-search-label'))
  const input = within(picker).getByTestId('workspace-shell-entity-search-input')
  await user.clear(input)
  await user.type(input, 'Player Car')
  const car = entityByName(currentWorld(), 'Player Car')!
  await user.click(within(picker).getByTestId(`workspace-shell-entity-search-result-${car.id}`))
  await waitFor(() =>
    expect(screen.getByTestId('workspace-shell-entity-search-label')).toHaveTextContent('Player Car'),
  )
}
