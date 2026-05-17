import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import CodingTabPanel from './CodingTabPanel'
import { EditorUndoProvider } from '@/contexts/EditorUndoContext'
import { CopyProvider } from '@/contexts/CopyContext'
import type { RennWorld } from '@/types/world'
import type { TransformerDef } from '@/types/transformer'
import { clearCustomTransformerRuntimeError } from '@/runtime/customTransformerErrorBridge'

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

const minimalWorldTransformers: Record<string, TransformerDef> = {
  e1_tf0: {
    type: 'custom',
    name: 'Test',
    code: 'return {};',
    priority: 10,
    enabled: true,
    params: {},
  },
}

const minimalWorld: RennWorld = {
  version: '1.0',
  world: { gravity: [0, -9.81, 0] },
  assets: {},
  transformers: minimalWorldTransformers,
  entities: [
    {
      id: 'e1',
      bodyType: 'dynamic',
      shape: { type: 'box', width: 1, height: 1, depth: 1 },
      position: [0, 0, 0],
      transformers: ['e1_tf0'],
    },
  ],
}

const worldWithScriptsForWorkspace: RennWorld = {
  ...minimalWorld,
  scripts: { scr_workspace: { event: 'onUpdate', source: '// attached' } },
  entities: [
    {
      ...minimalWorld.entities[0]!,
      transformers: ['e1_tf0'],
      scripts: ['scr_workspace'],
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

  it('shows thin transformer strip with slot labels and IDs', () => {
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel world={minimalWorld} selectedEntityIds={['e1']} onWorldChange={vi.fn()} />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    expect(screen.getByTestId('coding-inspector-transformer-e1_tf0')).toHaveTextContent('Test')
    expect(screen.getByTestId('coding-inspector-transformer-e1_tf0')).toHaveTextContent(/e1_tf0/)
  })

  it('clicking a transformer row opens the Workspace anchored to that ID', async () => {
    const onTransformerCodePopoutOpen = vi.fn()
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel
            world={minimalWorld}
            selectedEntityIds={['e1']}
            onWorldChange={vi.fn()}
            onTransformerCodePopoutOpen={onTransformerCodePopoutOpen}
          />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    fireEvent.click(screen.getByTestId('coding-inspector-transformer-e1_tf0'))
    await waitFor(() => expect(screen.getByTestId('workspace-panel')).toBeInTheDocument())
    expect(onTransformerCodePopoutOpen).toHaveBeenCalled()
    expect(screen.getByTestId('workspace-tab-transformers')).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByTestId('workspace-panel')).getByText(/Entity e1 · e1_tf0/)).toBeInTheDocument()
  })

  it('clicking an attached script row opens the Scripts workspace tab', async () => {
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel world={worldWithScriptsForWorkspace} selectedEntityIds={['e1']} onWorldChange={vi.fn()} />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    fireEvent.click(screen.getByTestId('coding-submenu-scripts'))
    fireEvent.click(screen.getByTestId('coding-inspector-script-scr_workspace'))
    await waitFor(() => expect(screen.getByTestId('workspace-panel')).toBeInTheDocument())
    expect(screen.getByTestId('workspace-tab-scripts')).toHaveAttribute('aria-selected', 'true')
  })

  it('Open Workspace opens shell and notifies transformer pop-out listener', async () => {
    const onTransformerCodePopoutOpen = vi.fn()
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel
            world={minimalWorld}
            selectedEntityIds={['e1']}
            onWorldChange={vi.fn()}
            onTransformerCodePopoutOpen={onTransformerCodePopoutOpen}
          />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    fireEvent.click(screen.getByTestId('coding-open-workspace'))
    await waitFor(() => expect(screen.getByTestId('workspace-panel')).toBeInTheDocument())
    expect(onTransformerCodePopoutOpen).toHaveBeenCalled()
    expect(within(screen.getByTestId('workspace-panel')).getByText(/Entity e1 · e1_tf0/)).toBeInTheDocument()
  })

  it('Open Workspace from Scripts tab supports Manage → Organize (Entity scope, scripts)', async () => {
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel world={worldWithScriptsForWorkspace} selectedEntityIds={['e1']} onWorldChange={vi.fn()} />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    fireEvent.click(screen.getByTestId('coding-submenu-scripts'))
    fireEvent.click(screen.getByTestId('coding-open-workspace'))
    await waitFor(() => expect(screen.getByTestId('workspace-tab-scripts')).toHaveAttribute('aria-selected', 'true'))
    fireEvent.click(screen.getByRole('button', { name: 'Manage' }))
    await waitFor(() => expect(screen.getByTestId('workspace-tab-organize')).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getByTestId('workspace-organize-scope-entity')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('workspace-organize-kind-scripts')).toHaveAttribute('aria-selected', 'true')
  })

  it('Open Workspace is disabled without entity selection', () => {
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel world={minimalWorld} selectedEntityIds={[]} onWorldChange={vi.fn()} />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    expect(screen.getByTestId('coding-open-workspace')).toBeDisabled()
  })

  it('inspector opens on Transformers when persisted tab ID is legacy "code"', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) =>
      key === 'builderCodingPanelSubTab' ? JSON.stringify('code') : null,
    )
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel world={minimalWorld} selectedEntityIds={['e1']} onWorldChange={vi.fn()} />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    expect(screen.getByTestId('coding-submenu-transformers')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('coding-inspector-transformer-e1_tf0')).toBeInTheDocument()
    expect(screen.queryByTestId('coding-submenu-code')).toBeNull()
    getItemSpy.mockRestore()
  })
})
