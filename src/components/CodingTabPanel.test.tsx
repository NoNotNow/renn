import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CodingTabPanel from './CodingTabPanel'
import { EditorUndoProvider } from '@/contexts/EditorUndoContext'
import { CopyProvider } from '@/contexts/CopyContext'
import type { RennWorld } from '@/types/world'
import {
  clearCustomTransformerRuntimeError,
} from '@/runtime/customTransformerErrorBridge'

vi.mock('@monaco-editor/react', () => ({
  default: function MockMonacoEditor() {
    return <div data-testid="mock-monaco-editor" />
  },
}))

const undoApi = {
  pushBeforeEdit: vi.fn(),
  notifyScrubStart: vi.fn(),
  notifyScrubEnd: vi.fn(),
}

const minimalWorld: RennWorld = {
  version: '1.0',
  world: { gravity: [0, -9.81, 0] },
  assets: {},
  entities: [
    {
      id: 'e1',
      bodyType: 'dynamic',
      shape: { type: 'box', width: 1, height: 1, depth: 1 },
      position: [0, 0, 0],
      transformers: [
        {
          type: 'custom',
          name: 'Test',
          code: 'return {};',
          priority: 10,
          enabled: true,
          params: {},
        },
      ],
    },
  ],
}

describe('CodingTabPanel', () => {
  beforeEach(() => {
    if (typeof localStorage?.removeItem === 'function') {
      localStorage.removeItem('builderCodingPanelSubTab')
    }
  })

  afterEach(() => {
    clearCustomTransformerRuntimeError()
  })

  it('Transformer code tab exposes custom transformer controls', () => {
    const onWorldChange = vi.fn()
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel
            world={minimalWorld}
            selectedEntityIds={['e1']}
            onWorldChange={onWorldChange}
          />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    fireEvent.click(screen.getByTestId('coding-submenu-code'))
    expect(screen.getByTestId('custom-transformer-select')).toBeInTheDocument()
    expect(screen.getByTestId('custom-transformer-name')).toHaveValue('Test')
  })

  it('Transformer code tab shows compile error below the editor when code is invalid', () => {
    const invalidWorld: RennWorld = {
      ...minimalWorld,
      entities: [
        {
          ...minimalWorld.entities[0]!,
          transformers: [
            {
              type: 'custom',
              name: 'Bad',
              code: 'eval(1)',
              priority: 10,
              enabled: true,
              params: {},
            },
          ],
        },
      ],
    }
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel world={invalidWorld} selectedEntityIds={['e1']} onWorldChange={vi.fn()} />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    fireEvent.click(screen.getByTestId('coding-submenu-code'))
    expect(screen.getByTestId('custom-transformer-compile-error')).toHaveTextContent(/dangerous pattern/i)
    expect(screen.getByTestId('custom-code-editor-resize-handle')).toBeInTheDocument()
  })

  it('Transformer code pop out header restores saved pose when icon clicked', () => {
    const onResetPose = vi.fn()
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel
            world={minimalWorld}
            selectedEntityIds={['e1']}
            onWorldChange={vi.fn()}
            onResetPoseToSavedWorld={onResetPose}
          />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    fireEvent.click(screen.getByTestId('coding-submenu-code'))
    fireEvent.click(screen.getByTestId('custom-transformer-code-popout-open'))
    fireEvent.click(screen.getByTestId('custom-transformer-code-popout-restore-pose'))
    expect(onResetPose).toHaveBeenCalledWith(['e1'])
  })

  it('Transformer code pop out opens overlay and docks back', () => {
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel world={minimalWorld} selectedEntityIds={['e1']} onWorldChange={vi.fn()} />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    fireEvent.click(screen.getByTestId('coding-submenu-code'))
    fireEvent.click(screen.getByTestId('custom-transformer-code-popout-open'))
    expect(screen.getByTestId('custom-transformer-code-popout-backdrop')).toBeInTheDocument()
    expect(screen.getByTestId('custom-transformer-code-docked-placeholder')).toBeInTheDocument()
    expect(screen.queryByTestId('custom-code-editor-resize-handle')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('custom-transformer-code-popout-dock'))
    expect(screen.queryByTestId('custom-transformer-code-popout-backdrop')).not.toBeInTheDocument()
    expect(screen.getByTestId('custom-code-editor-resize-handle')).toBeInTheDocument()
  })

  it('Transformer code pop out closes on Escape', () => {
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel world={minimalWorld} selectedEntityIds={['e1']} onWorldChange={vi.fn()} />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    fireEvent.click(screen.getByTestId('coding-submenu-code'))
    fireEvent.click(screen.getByTestId('custom-transformer-code-popout-open'))
    expect(screen.getByTestId('custom-transformer-code-popout-backdrop')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    expect(screen.queryByTestId('custom-transformer-code-popout-backdrop')).not.toBeInTheDocument()
  })

  it('Transformer code pop out reopens on Shift+Escape after Escape closed it', () => {
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel world={minimalWorld} selectedEntityIds={['e1']} onWorldChange={vi.fn()} />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    fireEvent.click(screen.getByTestId('coding-submenu-code'))
    fireEvent.click(screen.getByTestId('custom-transformer-code-popout-open'))
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    expect(screen.queryByTestId('custom-transformer-code-popout-backdrop')).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape', shiftKey: true })
    expect(screen.getByTestId('custom-transformer-code-popout-backdrop')).toBeInTheDocument()
  })

  it('Transformer code pop out shows compile error in overlay body', () => {
    const invalidWorld: RennWorld = {
      ...minimalWorld,
      entities: [
        {
          ...minimalWorld.entities[0]!,
          transformers: [
            {
              type: 'custom',
              name: 'Bad',
              code: 'eval(1)',
              priority: 10,
              enabled: true,
              params: {},
            },
          ],
        },
      ],
    }
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel world={invalidWorld} selectedEntityIds={['e1']} onWorldChange={vi.fn()} />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    fireEvent.click(screen.getByTestId('coding-submenu-code'))
    fireEvent.click(screen.getByTestId('custom-transformer-code-popout-open'))
    const body = screen.getByTestId('custom-transformer-code-popout-body')
    expect(body).toContainElement(screen.getByTestId('custom-transformer-compile-error'))
    expect(screen.getByTestId('custom-transformer-compile-error')).toHaveTextContent(/dangerous pattern/i)
  })

  it('Transformer code pop out horizontal trace allows toggling enabled state', () => {
    const onWorldChange = vi.fn()
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel
            world={minimalWorld}
            selectedEntityIds={['e1']}
            onWorldChange={onWorldChange}
          />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    fireEvent.click(screen.getByTestId('coding-submenu-code'))
    fireEvent.click(screen.getByTestId('custom-transformer-code-popout-open'))

    const toggle = screen.getByTestId('transformer-horizontal-enabled-toggle-0')
    fireEvent.click(toggle)

    expect(onWorldChange).toHaveBeenCalled()
    const updatedWorld = onWorldChange.mock.calls[0][0]
    expect(updatedWorld.entities[0].transformers[0].enabled).toBe(false)
  })

  it('Transformer code pop out horizontal trace allows reordering via drag and drop', () => {
    const multiTransformerWorld: RennWorld = {
      ...minimalWorld,
      entities: [
        {
          ...minimalWorld.entities[0]!,
          transformers: [
            { type: 'input', priority: 10, enabled: true, params: {} },
            { type: 'custom', name: 'Second', code: 'return {}', priority: 10, enabled: true, params: {} },
          ],
        },
      ],
    }
    const onWorldChange = vi.fn()
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel
            world={multiTransformerWorld}
            selectedEntityIds={['e1']}
            onWorldChange={onWorldChange}
          />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    fireEvent.click(screen.getByTestId('coding-submenu-code'))
    fireEvent.click(screen.getByTestId('custom-transformer-code-popout-open'))

    const item0 = screen.getByTestId('transformer-horizontal-item-0')
    const item1 = screen.getByTestId('transformer-horizontal-item-1')

    // Simulate drag and drop: drag item 0 and drop on item 1
    fireEvent.dragStart(item0)
    fireEvent.dragOver(item1)
    // In our live reordering, the items have already swapped in the local state.
    // We need to trigger dragEnd to commit the change.
    fireEvent.dragEnd(item0)

    expect(onWorldChange).toHaveBeenCalled()
    const updatedWorld = onWorldChange.mock.calls[0][0]
    // The second transformer (custom) should now be first
    expect(updatedWorld.entities[0].transformers[0].type).toBe('custom')
    expect(updatedWorld.entities[0].transformers[1].type).toBe('input')
  })
})
