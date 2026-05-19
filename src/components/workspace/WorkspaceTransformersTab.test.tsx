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
})
