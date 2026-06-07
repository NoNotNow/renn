import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCallback, useRef, useState, type ComponentProps } from 'react'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WorkspaceTransformersTab from './WorkspaceTransformersTab'
import WorkspaceMonacoSlot from './WorkspaceMonacoSlot'
import type { WorkspaceMonacoEditorChrome } from '@/types/workspaceMonacoChrome'
import { COMPILE_ERROR_DISPLAY_DEBOUNCE_MS } from '@/hooks/useDebouncedCompileErrorDisplay'
import type { RennWorld } from '@/types/world'
import type { WorkspaceMonacoPayload } from '@/types/workspace'
import { CopyProvider } from '@/contexts/CopyContext'
import { EditorUndoProvider } from '@/contexts/EditorUndoContext'
import {
  clearCustomTransformerRuntimeError,
  publishCustomTransformerRuntimeError,
} from '@/runtime/customTransformerErrorBridge'
import {
  publishTransformerWatchEntry,
  resetTransformerWatchBridgeForTests,
  setTransformerWatchEnabled,
} from '@/runtime/transformerWatchBridge'

vi.mock('@monaco-editor/react', () => ({
  default: () => null,
}))

const undoApi = {
  pushBeforeEdit: vi.fn(),
  notifyScrubStart: vi.fn(),
  notifyScrubEnd: vi.fn(),
}

const CAR_PIPE_ID = 'pipe1'

function carTransformersEntry(itemId: string) {
  return {
    entityId: 'car',
    tab: 'transformers' as const,
    itemId,
    pipeNavPath: [{ kind: 'stack' as const, index: 0 }],
  }
}

const carStackWorld: RennWorld = {
  version: '1.0',
  world: { gravity: [0, -9.81, 0] },
  assets: {},
  entities: [
    {
      id: 'car',
      bodyType: 'dynamic',
      shape: { type: 'box', width: 1, height: 1, depth: 1 },
      position: [0, 0, 0],
      transformers: ['car_tf0', 'car_tf1', 'car_tf2'],
      transformerPipeStack: [{ pipeId: CAR_PIPE_ID, enabled: true }],
    },
  ],
  transformers: {
    car_tf0: { type: 'input', priority: 0, enabled: true, params: {} },
    car_tf1: { type: 'car2', priority: 1, enabled: true, params: {} },
    car_tf2: {
      type: 'custom',
      priority: 2,
      enabled: true,
      params: {},
      code: 'return { force: [0, 0, 0] };',
      name: 'Custom',
    },
  },
  transformerPipes: {
    [CAR_PIPE_ID]: {
      id: CAR_PIPE_ID,
      name: 'Pipe1',
      stageIds: ['car_tf0', 'car_tf1', 'car_tf2'],
      stages: [
        { type: 'input', priority: 0, enabled: true, params: {} },
        { type: 'car2', priority: 1, enabled: true, params: {} },
        {
          type: 'custom',
          priority: 2,
          enabled: true,
          params: {},
          code: 'return { force: [0, 0, 0] };',
          name: 'Custom',
        },
      ],
      members: [
        { kind: 'stage', stageId: 'car_tf0' },
        { kind: 'stage', stageId: 'car_tf1' },
        { kind: 'stage', stageId: 'car_tf2' },
      ],
    },
  },
}

function TabWithMonacoHarness(
  props: Partial<ComponentProps<typeof WorkspaceTransformersTab>> & {
    setMonacoPayload?: (p: WorkspaceMonacoPayload) => void
  },
) {
  const setMonacoPayload = props.setMonacoPayload ?? vi.fn()
  const [monacoChrome, setMonacoChrome] = useState<WorkspaceMonacoEditorChrome | null>(null)
  const editorAreaRef = useRef<HTMLDivElement | null>(null)
  const [editorAreaEpoch, setEditorAreaEpoch] = useState(0)

  const handleEditorAreaReady = useCallback(() => setEditorAreaEpoch((n) => n + 1), [])

  const monacoSlot = (
    <WorkspaceMonacoSlot
      monacoSlot={null}
      onRefresh={vi.fn()}
      editorAreaRef={editorAreaRef}
      onEditorAreaReady={handleEditorAreaReady}
      toolbarExtra={monacoChrome?.toolbarExtra}
      overlay={monacoChrome?.overlay}
    />
  )

  return (
    <WorkspaceTransformersTab
      world={carStackWorld}
      selectedEntityIds={['car']}
      entry={carTransformersEntry('car_tf2')}
      workspaceOpen
      liveTraceSteps={null}
      onWorldChange={vi.fn()}
      setMonacoPayload={setMonacoPayload}
      setMonacoEditorChrome={setMonacoChrome}
      monacoEditorAreaRef={editorAreaRef}
      monacoEditorAreaEpoch={editorAreaEpoch}
      monacoSlot={monacoSlot}
      {...props}
    />
  )
}

function renderTab(
  props: Partial<ComponentProps<typeof WorkspaceTransformersTab>> & {
    setMonacoPayload?: (p: WorkspaceMonacoPayload) => void
  } = {},
) {
  return render(
    <CopyProvider>
      <EditorUndoProvider value={undoApi}>
        <TabWithMonacoHarness {...props} />
      </EditorUndoProvider>
    </CopyProvider>,
  )
}

function lastMonacoPayload(setMonacoPayload: ReturnType<typeof vi.fn>): WorkspaceMonacoPayload | undefined {
  const calls = setMonacoPayload.mock.calls
  return calls[calls.length - 1]?.[0] as WorkspaceMonacoPayload | undefined
}

describe('WorkspaceTransformersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    clearCustomTransformerRuntimeError()
  })

  it('binds Monaco to custom code when custom stage is selected', async () => {
    const setMonacoPayload = vi.fn()
    renderTab({ setMonacoPayload })

    await waitFor(() => {
      const payload = lastMonacoPayload(setMonacoPayload)
      expect(payload?.kind).toBe('transformer-ts')
      expect(payload?.value).toContain('return { force')
    })
  })

  it('keeps user-selected custom after reorder when entry anchor points at another stage', async () => {
    const setMonacoPayload = vi.fn()
    const onWorldChange = vi.fn()
    renderTab({
      setMonacoPayload,
      onWorldChange,
      entry: carTransformersEntry('car_tf0'),
    })

    await waitFor(() => {
      expect(lastMonacoPayload(setMonacoPayload)?.kind).toBe('placeholder')
    })

    fireEvent.click(screen.getByTitle('Show code'))

    await waitFor(() => {
      expect(lastMonacoPayload(setMonacoPayload)?.kind).toBe('transformer-ts')
    })

    const customCard = screen.getByTestId('transformer-horizontal-item-2')
    const firstSlot = screen.getByTestId('transformer-horizontal-item-0')

    fireEvent.dragStart(customCard)
    fireEvent.dragOver(firstSlot)
    fireEvent.drop(firstSlot)
    fireEvent.dragEnd(customCard)

    await waitFor(() => {
      const payload = lastMonacoPayload(setMonacoPayload)
      expect(payload?.kind).toBe('transformer-ts')
      expect(payload?.value).toContain('return { force')
    })

    const lastWorld = onWorldChange.mock.calls.at(-1)?.[0] as RennWorld
    expect(lastWorld.entities[0]?.transformers?.[0]).toBe('car_tf2')
  })

  it('syncs entry.itemId when selecting custom code so close/reopen can restore selection', async () => {
    const onEntryChange = vi.fn()
    const { rerender } = renderTab({
      entry: carTransformersEntry('car_tf0'),
      onEntryChange,
    })

    fireEvent.click(screen.getByTitle('Show code'))

    await waitFor(() => {
      expect(onEntryChange).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: 'car', tab: 'transformers', itemId: 'car_tf2' }),
      )
    })

    rerender(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <TabWithMonacoHarness
            entry={carTransformersEntry('car_tf2')}
            workspaceOpen={false}
          />
        </EditorUndoProvider>
      </CopyProvider>,
    )

    const setMonacoPayload = vi.fn()
    rerender(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <TabWithMonacoHarness
            entry={carTransformersEntry('car_tf2')}
            setMonacoPayload={setMonacoPayload}
          />
        </EditorUndoProvider>
      </CopyProvider>,
    )

    await waitFor(() => {
      expect(lastMonacoPayload(setMonacoPayload)?.kind).toBe('transformer-ts')
      expect(lastMonacoPayload(setMonacoPayload)?.value).toContain('return { force')
    })
  })

  it('keeps custom Monaco active after reordering custom stage to the front', async () => {
    const setMonacoPayload = vi.fn()
    const onWorldChange = vi.fn()
    renderTab({ setMonacoPayload, onWorldChange })

    await waitFor(() => {
      expect(lastMonacoPayload(setMonacoPayload)?.kind).toBe('transformer-ts')
    })

    const customCard = screen.getByTestId('transformer-horizontal-item-2')
    const firstSlot = screen.getByTestId('transformer-horizontal-item-0')

    fireEvent.dragStart(customCard)
    fireEvent.dragOver(firstSlot)
    fireEvent.drop(firstSlot)
    fireEvent.dragEnd(customCard)

    await waitFor(() => {
      expect(onWorldChange).toHaveBeenCalled()
      const payload = lastMonacoPayload(setMonacoPayload)
      expect(payload?.kind).toBe('transformer-ts')
      expect(payload?.value).toContain('return { force')
    })

    const lastWorld = onWorldChange.mock.calls.at(-1)?.[0] as RennWorld
    expect(lastWorld.entities[0]?.transformers?.[0]).toBe('car_tf2')
    expect(lastWorld.transformers?.car_tf2?.code).toContain('return { force')
  })

  it('uses pipe nav add menu instead of header Save as Pipe', async () => {
    renderTab({ world: carStackWorld })
    expect(screen.queryByText('+ Add Pipe')).toBeNull()
    expect(screen.queryByText('Save as Pipe')).toBeNull()
    expect(screen.getByTestId('pipe-focused-add-button')).toBeDefined()
  })

  it('auto-wraps a fresh entity in Pipe1 when opened in transformers tab', async () => {
    const user = userEvent.setup()
    const freshWorld: RennWorld = {
      version: '1',
      world: {},
      entities: [
        {
          id: 'fresh',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 1, height: 1, depth: 1 },
          position: [0, 0, 0],
          transformers: [],
        },
      ],
      transformers: {},
    }
    const onWorldChange = vi.fn()
    const setMonacoPayload = vi.fn()
    renderTab({
      world: freshWorld,
      onWorldChange,
      setMonacoPayload,
      selectedEntityIds: ['fresh'],
      entry: { entityId: 'fresh', tab: 'transformers' },
    })

    await waitFor(() => expect(onWorldChange).toHaveBeenCalled())
    const next = onWorldChange.mock.calls.at(-1)?.[0] as RennWorld
    const entity = next.entities.find((e) => e.id === 'fresh')!
    const pipeId = entity.transformerPipeStack?.[0]?.pipeId
    expect(pipeId).toBeDefined()
    expect(next.transformerPipes?.[pipeId!]?.name).toBe('Pipe1')

    const addButton = await screen.findByTestId('pipe-focused-add-button')
    expect(addButton.getAttribute('data-leaf-level')).toBe('true')

    await user.click(addButton)
    expect(screen.getByText('Add to pipeline')).toBeInTheDocument()
    expect(screen.getByTestId('add-transformer-search')).toBeInTheDocument()

    await waitFor(() => {
      const payload = lastMonacoPayload(setMonacoPayload)
      expect(payload?.kind).toBe('placeholder')
      expect(payload?.value).toContain('Add a custom transformer to Pipe using the + button.')
    })
  })

  it('wraps legacy ungrouped stages into the existing pipe without corrupting world', async () => {
    const user = userEvent.setup()
    const legacyWorld: RennWorld = {
      version: '1',
      world: {},
      entities: [
        {
          id: 'car',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 1, height: 1, depth: 1 },
          position: [0, 0, 0],
          transformers: ['car_tf0', 'car_tf1'],
          transformerPipe: 'p1',
        },
      ],
      transformers: {
        car_tf0: { type: 'input', priority: 0, enabled: true, params: {} },
        car_tf1: {
          type: 'custom',
          priority: 1,
          enabled: true,
          params: {},
          code: 'return {};',
          name: 'Follower',
        },
      },
      transformerPipes: {
        p1: {
          id: 'p1',
          name: 'Follower car',
          stageIds: ['car_tf0'],
          stages: [{ type: 'input', priority: 0, enabled: true, params: {} }],
        },
      },
    }

    function Harness() {
      const [world, setWorld] = useState(legacyWorld)
      return (
        <TabWithMonacoHarness
          world={world}
          onWorldChange={setWorld}
          selectedEntityIds={['car']}
          entry={{ entityId: 'car', tab: 'transformers' }}
        />
      )
    }

    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <Harness />
        </EditorUndoProvider>
      </CopyProvider>,
    )

    expect(screen.getByTestId('pipe-ungrouped-banner')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Wrap into pipe' }))

    await waitFor(() => {
      expect(screen.queryByTestId('pipe-ungrouped-banner')).not.toBeInTheDocument()
    })
  })

  it('make unique clones registry entry when shared usage badge is confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const sharedWorld: RennWorld = {
      ...carStackWorld,
      entities: [
        { ...carStackWorld.entities[0]! },
        {
          id: 'car2',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 1, height: 1, depth: 1 },
          position: [2, 0, 0],
          transformers: ['car_tf0', 'car_tf1', 'car_tf2'],
        },
      ],
    }
    const onWorldChange = vi.fn()
    renderTab({ world: sharedWorld, onWorldChange, entry: carTransformersEntry('car_tf0') })

    expect(screen.getAllByText(/👤 x2/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByTestId('transformer-shared-usage-0'))

    await waitFor(() => expect(onWorldChange).toHaveBeenCalled())
    expect(confirmSpy).toHaveBeenCalled()
    confirmSpy.mockRestore()

    const next = onWorldChange.mock.calls.at(-1)?.[0] as RennWorld
    const car = next.entities.find((e) => e.id === 'car')!
    expect(car.transformers?.[0]).not.toBe('car_tf0')
    expect(next.transformers?.[car.transformers![0]!]?.type).toBe('input')
    expect(next.entities.find((e) => e.id === 'car2')?.transformers?.[0]).toBe('car_tf0')
    expect(Object.values(
      next.entities.reduce<Record<string, number>>((counts, e) => {
        e.transformers?.forEach((id) => {
          counts[id] = (counts[id] || 0) + 1
        })
        return counts
      }, {}),
    ).filter((n) => n > 1)).toHaveLength(2)
  })

  it('does not make unique when shared usage confirmation is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const sharedWorld: RennWorld = {
      ...carStackWorld,
      entities: [
        { ...carStackWorld.entities[0]! },
        {
          id: 'car2',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 1, height: 1, depth: 1 },
          position: [2, 0, 0],
          transformers: ['car_tf0', 'car_tf1', 'car_tf2'],
        },
      ],
    }
    const onWorldChange = vi.fn()
    renderTab({ world: sharedWorld, onWorldChange })

    fireEvent.click(screen.getByTestId('transformer-shared-usage-0'))
    expect(confirmSpy).toHaveBeenCalled()
    expect(onWorldChange).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('shows compile error border on the custom transformer card', async () => {
    const invalidWorld: RennWorld = {
      ...carStackWorld,
      transformers: {
        ...carStackWorld.transformers,
        car_tf2: {
          ...carStackWorld.transformers!.car_tf2!,
          code: 'return {',
        },
      },
    }
    renderTab({ world: invalidWorld })

    await waitFor(() => {
      const customCard = screen.getByTestId('transformer-horizontal-item-2')
      expect(customCard).toHaveAttribute('data-card-error', 'compile')
      expect(customCard.getAttribute('style')).toContain('border: 1px solid rgb(220, 38, 38)')
    })
  })

  it('shows runtime error borders on every failing transformer card in the chain', async () => {
    const dualCustomWorld: RennWorld = {
      ...carStackWorld,
      entities: [
        {
          ...carStackWorld.entities[0]!,
          transformers: ['car_tf0', 'car_tf1', 'car_tf2'],
        },
      ],
      transformers: {
        ...carStackWorld.transformers,
        car_tf1: {
          type: 'custom',
          priority: 1,
          enabled: true,
          params: {},
          code: 'throw new Error("Boom1")',
          name: 'Custom 1',
        },
      },
    }
    renderTab({ world: dualCustomWorld })

    act(() => {
      publishCustomTransformerRuntimeError({
        entityId: 'car',
        configStackIndex: 1,
        message: 'Boom1',
        code: 'throw new Error("Boom1")',
      })
      publishCustomTransformerRuntimeError({
        entityId: 'car',
        configStackIndex: 2,
        message: 'Boom2',
        code: 'throw new Error("Boom2")',
      })
    })

    await waitFor(() => {
      const firstCustomCard = screen.getByTestId('transformer-horizontal-item-1')
      const secondCustomCard = screen.getByTestId('transformer-horizontal-item-2')
      expect(firstCustomCard).toHaveAttribute('data-card-error', 'runtime')
      expect(secondCustomCard).toHaveAttribute('data-card-error', 'runtime')
    })
  })

  it('shows runtime error border on the failing transformer card', async () => {
    renderTab()

    act(() => {
      publishCustomTransformerRuntimeError({
        entityId: 'car',
        configStackIndex: 2,
        message: 'Boom',
        code: 'throw new Error("Boom")',
        lineNumber: 3,
      })
    })

    await waitFor(() => {
      const customCard = screen.getByTestId('transformer-horizontal-item-2')
      expect(customCard).toHaveAttribute('data-card-error', 'runtime')
      expect(customCard.getAttribute('style')).toContain('border: 1px solid rgb(201, 162, 39)')
    })
  })

  it('prefers compile error border over runtime on the same card', async () => {
    const invalidWorld: RennWorld = {
      ...carStackWorld,
      transformers: {
        ...carStackWorld.transformers,
        car_tf2: {
          ...carStackWorld.transformers!.car_tf2!,
          code: 'return {',
        },
      },
    }
    renderTab({ world: invalidWorld })

    act(() => {
      publishCustomTransformerRuntimeError({
        entityId: 'car',
        configStackIndex: 2,
        message: 'Boom',
        code: 'return {',
      })
    })

    await waitFor(() => {
      const customCard = screen.getByTestId('transformer-horizontal-item-2')
      expect(customCard).toHaveAttribute('data-card-error', 'compile')
      expect(customCard.getAttribute('style')).toContain('border: 1px solid rgb(220, 38, 38)')
    })
  })

  it('debounces compile error overlay while editing custom transformer code', async () => {
    vi.useFakeTimers()
    const invalidWorld: RennWorld = {
      ...carStackWorld,
      transformers: {
        ...carStackWorld.transformers,
        car_tf2: {
          ...carStackWorld.transformers!.car_tf2!,
          code: 'return {',
        },
      },
    }
    renderTab({ world: invalidWorld })

    expect(screen.queryByTestId('workspace-transformer-compile-error')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(COMPILE_ERROR_DISPLAY_DEBOUNCE_MS)
    })

    expect(screen.getByTestId('workspace-transformer-compile-error')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('shows runtime error overlay without shrinking the code column', async () => {
    renderTab()

    act(() => {
      publishCustomTransformerRuntimeError({
        entityId: 'car',
        configStackIndex: 2,
        message: 'Boom',
        code: 'throw new Error("Boom")',
        lineNumber: 3,
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('workspace-transformer-runtime-error')).toBeInTheDocument()
      expect(screen.getByText('Boom')).toBeInTheDocument()
    })
  })

  it('opens watch panel and shows label: value rows', async () => {
    resetTransformerWatchBridgeForTests()
    setTransformerWatchEnabled(true)
    renderTab()

    fireEvent.click(screen.getByTestId('workspace-transformer-watch-toggle'))

    act(() => {
      publishTransformerWatchEntry({
        entityId: 'car',
        configStackIndex: 2,
        label: 'x after add',
        value: '234',
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('workspace-transformer-watch-panel')).toBeInTheDocument()
      expect(screen.getByTestId('workspace-transformer-watch-value-x after add')).toHaveTextContent('234')
    })
  })

  it('shows resize handles on the watch panel', async () => {
    resetTransformerWatchBridgeForTests()
    setTransformerWatchEnabled(true)
    renderTab()

    fireEvent.click(screen.getByTestId('workspace-transformer-watch-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('workspace-transformer-watch-panel')).toBeInTheDocument()
    })

    expect(screen.getByTitle('Resize width from left')).toBeInTheDocument()
    expect(screen.getByTitle('Resize width from right')).toBeInTheDocument()
    expect(screen.getByTitle('Resize height')).toBeInTheDocument()
    expect(screen.getByTitle('Resize width and height from left')).toBeInTheDocument()
    expect(screen.getByTitle('Resize width and height from right')).toBeInTheDocument()
  })

  it('restores watch panel size after close and reopen', async () => {
    resetTransformerWatchBridgeForTests()
    setTransformerWatchEnabled(true)
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    })
    storage.set(
      'rennWorkspaceWatchPanelPos',
      JSON.stringify({ x: 10, y: 12, width: 360, height: 320 }),
    )
    renderTab()

    fireEvent.click(screen.getByTestId('workspace-transformer-watch-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('workspace-transformer-watch-panel')).toHaveStyle({
        width: '360px',
        height: '320px',
      })
    })
  })

  it('restores watch panel position after close and reopen', async () => {
    resetTransformerWatchBridgeForTests()
    setTransformerWatchEnabled(true)
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    })
    storage.set('rennWorkspaceWatchPanelPos', JSON.stringify({ x: 42, y: 17 }))
    renderTab()

    fireEvent.click(screen.getByTestId('workspace-transformer-watch-toggle'))
    await waitFor(() => {
      expect(screen.getByTestId('workspace-transformer-watch-panel')).toBeInTheDocument()
    })

    const panel = screen.getByTestId('workspace-transformer-watch-panel')
    expect(panel).toHaveStyle({ left: '42px', top: '17px' })

    fireEvent.click(screen.getByTestId('workspace-transformer-watch-toggle'))
    await waitFor(() => {
      expect(screen.queryByTestId('workspace-transformer-watch-panel')).toBeNull()
    })

    fireEvent.click(screen.getByTestId('workspace-transformer-watch-toggle'))
    await waitFor(() => {
      expect(screen.getByTestId('workspace-transformer-watch-panel')).toHaveStyle({ left: '42px', top: '17px' })
    })
  })

  it('clears watch entries from the panel', async () => {
    resetTransformerWatchBridgeForTests()
    setTransformerWatchEnabled(true)
    renderTab()
    fireEvent.click(screen.getByTestId('workspace-transformer-watch-toggle'))

    act(() => {
      publishTransformerWatchEntry({
        entityId: 'car',
        configStackIndex: 2,
        label: 'speed',
        value: '9',
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('workspace-transformer-watch-list')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('workspace-transformer-watch-clear'))

    await waitFor(() => {
      expect(screen.queryByTestId('workspace-transformer-watch-list')).toBeNull()
    })
  })

  it('renames a custom transformer inline on the pipeline card', async () => {
    const user = userEvent.setup()
    const onWorldChange = vi.fn()
    renderTab({
      onWorldChange,
      entry: carTransformersEntry('car_tf2'),
    })

    const nameInput = screen.getByTestId('transformer-card-name-input-2')
    await user.clear(nameInput)
    await user.type(nameInput, 'AutoBrake')
    fireEvent.blur(nameInput)

    await waitFor(() => expect(onWorldChange).toHaveBeenCalled())
    const next = onWorldChange.mock.calls.at(-1)?.[0] as RennWorld
    expect(next.transformers?.car_tf2?.name).toBe('AutoBrake')
  })

  it('selects a newly added custom transformer so Monaco shows its code', async () => {
    const user = userEvent.setup()
    const inputOnlyWorld: RennWorld = {
      version: '1.0',
      world: { gravity: [0, -9.81, 0] },
      assets: {},
      entities: [
        {
          id: 'car',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 1, height: 1, depth: 1 },
          position: [0, 0, 0],
          transformers: ['car_tf0'],
        },
      ],
      transformers: {
        car_tf0: { type: 'input', priority: 0, enabled: true, params: {} },
      },
    }

    const setMonacoPayload = vi.fn()
    const onEntryChange = vi.fn()

    function Harness() {
      const [world, setWorld] = useState(inputOnlyWorld)
      return (
        <CopyProvider>
          <EditorUndoProvider value={undoApi}>
            <TabWithMonacoHarness
              world={world}
              entry={{ entityId: 'car', tab: 'transformers', itemId: 'car_tf0' }}
              onWorldChange={setWorld}
              setMonacoPayload={setMonacoPayload}
              onEntryChange={onEntryChange}
            />
          </EditorUndoProvider>
        </CopyProvider>
      )
    }

    render(<Harness />)

    await waitFor(() => {
      expect(lastMonacoPayload(setMonacoPayload)?.kind).toBe('placeholder')
    })

    await user.click(screen.getByTestId('pipe-focused-add-button'))
    await user.click(screen.getByTestId('add-transformer-preset-custom'))
    await user.click(screen.getByTestId('add-transformer-add-preset'))

    await waitFor(() => {
      const payload = lastMonacoPayload(setMonacoPayload)
      expect(payload?.kind).toBe('transformer-ts')
      expect(payload?.value).toContain('function transform')
    })

    await waitFor(() => {
      expect(onEntryChange).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: 'car', tab: 'transformers', itemId: 'car_tf1' }),
      )
    })
  })

  it('shows pipe navigation sidebar when entity has a linked pipe', async () => {
    const pipeWorld: RennWorld = {
      ...carStackWorld,
      transformerPipes: {
        p1: {
          id: 'p1',
          name: 'My Pipe',
          stageIds: ['car_tf0'],
          stages: [],
        },
      },
      entities: [
        {
          ...carStackWorld.entities[0]!,
          transformerPipeStack: [{ pipeId: 'p1' }],
        },
      ],
    }
    renderTab({ world: pipeWorld })
    if (!screen.queryByTestId('pipe-nav-sidebar')) {
      fireEvent.click(screen.getByTestId('pipe-nav-open'))
    }
    expect(screen.getByTestId('pipe-nav-sidebar')).toBeDefined()
    expect(screen.getAllByText('My Pipe').length).toBeGreaterThan(0)
  })

  describe('pipe config editing', () => {
    const CONFIG_PIPE_ID = 'pipe-speed'

    function configPipeWorld(): RennWorld {
      return {
        ...carStackWorld,
        transformerPipes: {
          [CONFIG_PIPE_ID]: {
            id: CONFIG_PIPE_ID,
            name: 'SpeedPipe',
            stageIds: ['car_tf0', 'car_tf1', 'car_tf2'],
            stages: carStackWorld.transformerPipes![CAR_PIPE_ID]!.stages,
            members: carStackWorld.transformerPipes![CAR_PIPE_ID]!.members,
            paramDefs: [{ key: 'speed', type: 'number' }],
            defaultParams: { speed: 5 },
          },
        },
        entities: [
          {
            ...carStackWorld.entities[0]!,
            transformerPipeStack: [{ pipeId: CONFIG_PIPE_ID, params: { speed: 3 } }],
          },
        ],
      }
    }

    beforeEach(() => {
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

    it('opens pipe config from the focused strip pipe card', async () => {
      renderTab({
        world: configPipeWorld(),
        entry: { entityId: 'car', tab: 'transformers', pipeNavPath: [], pipeNavSelectedIndex: 0 },
      })

      fireEvent.click(screen.getByTestId('pipe-controls-config'))

      await waitFor(() => {
        expect(screen.getByTestId('pipe-config-drawer')).toBeInTheDocument()
        expect(screen.getByText('Pipe config: SpeedPipe')).toBeInTheDocument()
      })
    })

    it('opens pipe config from the tree context menu', async () => {
      renderTab({
        world: configPipeWorld(),
        entry: { entityId: 'car', tab: 'transformers', pipeNavPath: [], pipeNavSelectedIndex: 0 },
      })

      const tree = screen.getByTestId('pipe-nav-tree')
      const treeRow = within(tree).getByText('SpeedPipe').closest('div')!
      fireEvent.mouseEnter(treeRow)
      fireEvent.click(within(treeRow).getByTitle('More'))
      fireEvent.click(within(treeRow).getByText('Edit config'))

      await waitFor(() => {
        expect(screen.getByTestId('pipe-config-drawer')).toBeInTheDocument()
      })
    })

    it('writes per-entity pipe params from the config drawer', async () => {
      const onWorldChange = vi.fn()
      renderTab({
        world: configPipeWorld(),
        entry: { entityId: 'car', tab: 'transformers', pipeNavPath: [], pipeNavSelectedIndex: 0 },
        onWorldChange,
      })

      fireEvent.click(screen.getByTestId('pipe-controls-config'))

      await waitFor(() => {
        expect(screen.getByTestId('pipe-config-drawer')).toBeInTheDocument()
      })

      const speedInput = screen.getByDisplayValue('3')
      fireEvent.change(speedInput, { target: { value: '7' } })

      await waitFor(() => expect(onWorldChange).toHaveBeenCalled())
      const next = onWorldChange.mock.calls.at(-1)?.[0] as RennWorld
      expect(next.entities[0]?.transformerPipeStack?.[0]?.params?.speed).toBe(7)
    })

    it('shows JSON config editor when pipe has no paramDefs', async () => {
      renderTab({
        world: carStackWorld,
        entry: { entityId: 'car', tab: 'transformers', pipeNavPath: [], pipeNavSelectedIndex: 0 },
      })

      fireEvent.click(screen.getByTestId('pipe-controls-config'))

      await waitFor(() => {
        expect(screen.getByTestId('pipe-config-drawer')).toBeInTheDocument()
        expect(screen.getByTestId('pipe-params-json')).toBeInTheDocument()
        expect(screen.getByTestId('pipe-params-json')).toHaveValue('{}')
      })
    })

    it('writes per-entity pipe params from the JSON config editor', async () => {
      const onWorldChange = vi.fn()
      renderTab({
        world: carStackWorld,
        entry: { entityId: 'car', tab: 'transformers', pipeNavPath: [], pipeNavSelectedIndex: 0 },
        onWorldChange,
      })

      fireEvent.click(screen.getByTestId('pipe-controls-config'))

      await waitFor(() => {
        expect(screen.getByTestId('pipe-params-json')).toBeInTheDocument()
      })

      const textarea = screen.getByTestId('pipe-params-json')
      fireEvent.change(textarea, { target: { value: '{\n  "maxSpeed": 12\n}' } })
      fireEvent.click(screen.getByTestId('pipe-params-json-apply'))

      await waitFor(() => expect(onWorldChange).toHaveBeenCalled())
      const next = onWorldChange.mock.calls.at(-1)?.[0] as RennWorld
      expect(next.entities[0]?.transformerPipeStack?.[0]?.params).toEqual({ maxSpeed: 12 })
    })
  })
})
