import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WorkspaceTransformersTab from './WorkspaceTransformersTab'
import type { RennWorld } from '@/types/world'
import type { WorkspaceMonacoPayload } from '@/types/workspace'
import { CopyProvider } from '@/contexts/CopyContext'
import { EditorUndoProvider } from '@/contexts/EditorUndoContext'

vi.mock('@monaco-editor/react', () => ({
  default: () => null,
}))

const undoApi = {
  pushBeforeEdit: vi.fn(),
  notifyScrubStart: vi.fn(),
  notifyScrubEnd: vi.fn(),
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
}

function renderTab(
  props: Partial<ComponentProps<typeof WorkspaceTransformersTab>> & {
    setMonacoPayload?: (p: WorkspaceMonacoPayload) => void
  } = {},
) {
  const setMonacoPayload = props.setMonacoPayload ?? vi.fn()
  return render(
    <CopyProvider>
      <EditorUndoProvider value={undoApi}>
        <WorkspaceTransformersTab
          world={carStackWorld}
          selectedEntityIds={['car']}
          entry={{ entityId: 'car', tab: 'transformers', itemId: 'car_tf2' }}
          workspaceOpen
          liveTraceSteps={null}
          onWorldChange={vi.fn()}
          setMonacoPayload={setMonacoPayload}
          monacoSlot={null}
          {...props}
        />
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
      entry: { entityId: 'car', tab: 'transformers', itemId: 'car_tf0' },
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
      entry: { entityId: 'car', tab: 'transformers', itemId: 'car_tf0' },
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
          <WorkspaceTransformersTab
            world={carStackWorld}
            selectedEntityIds={['car']}
            entry={{ entityId: 'car', tab: 'transformers', itemId: 'car_tf2' }}
            workspaceOpen={false}
            liveTraceSteps={null}
            onWorldChange={vi.fn()}
            setMonacoPayload={vi.fn()}
            monacoSlot={null}
          />
        </EditorUndoProvider>
      </CopyProvider>,
    )

    const setMonacoPayload = vi.fn()
    rerender(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <WorkspaceTransformersTab
            world={carStackWorld}
            selectedEntityIds={['car']}
            entry={{ entityId: 'car', tab: 'transformers', itemId: 'car_tf2' }}
            workspaceOpen
            liveTraceSteps={null}
            onWorldChange={vi.fn()}
            setMonacoPayload={setMonacoPayload}
            monacoSlot={null}
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

  it('shows Save as Pipe and Add Pipe buttons', async () => {
    renderTab()
    expect(screen.getByText('Save as Pipe')).toBeDefined()
    expect(screen.getByText('+ Add Pipe')).toBeDefined()
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
    renderTab({ world: sharedWorld, onWorldChange, entry: { entityId: 'car', tab: 'transformers', itemId: 'car_tf0' } })

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

  it('shows shared pipe banner when entity is linked to a pipe', async () => {
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
          transformerPipe: 'p1',
        },
      ],
    }
    renderTab({ world: pipeWorld })
    expect(screen.getByText(/Shared pipe:/)).toBeDefined()
    expect(screen.getByText('My Pipe')).toBeDefined()
  })
})
