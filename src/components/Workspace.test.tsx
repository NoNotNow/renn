import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState, type ReactElement } from 'react'
import Workspace from './Workspace'
import { resetWorkspaceEditorInitialRefreshForTests, WORKSPACE_EDITOR_OPEN_REFRESH_MS } from './workspaceMonacoSession'
import type { WorkspaceTarget } from '@/types/workspace'
import type { RennWorld } from '@/types/world'
import type { TransformerDef } from '@/types/transformer'
import { CopyProvider } from '@/contexts/CopyContext'
import { EditorUndoProvider } from '@/contexts/EditorUndoContext'
import { defaultPersistence } from '@/persistence/indexedDb'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import { clearCustomTransformerRuntimeError } from '@/runtime/customTransformerErrorBridge'

const monacoMount = vi.hoisted(() => ({ count: 0 }))

vi.mock('@monaco-editor/react', () => ({
  default: function MockMonacoEditor() {
    monacoMount.count += 1
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
  entities: [{ id: 'e1', bodyType: 'dynamic', shape: { type: 'box', width: 1, height: 1, depth: 1 }, position: [0, 0, 0] }],
}

const registryTransformers: Record<string, TransformerDef> = {
  e1_tf0: {
    type: 'custom',
    name: 'TestTf',
    code: 'return {};',
    priority: 10,
    enabled: true,
    params: {},
  },
}

const PIPE_ID = 'pipe1'

const worldWithTransformer: RennWorld = {
  ...minimalWorld,
  transformers: registryTransformers,
  transformerPipes: {
    [PIPE_ID]: {
      id: PIPE_ID,
      name: 'Pipe1',
      stageIds: ['e1_tf0'],
      stages: [registryTransformers.e1_tf0],
      members: [{ kind: 'stage', stageId: 'e1_tf0' }],
    },
  },
  entities: [
    {
      id: 'e1',
      bodyType: 'dynamic',
      shape: { type: 'box', width: 1, height: 1, depth: 1 },
      position: [0, 0, 0],
      transformers: ['e1_tf0'],
      transformerPipeStack: [{ pipeId: PIPE_ID, enabled: true }],
    },
  ],
}

const worldWithScript: RennWorld = {
  ...minimalWorld,
  scripts: { my_script: { event: 'onUpdate', source: '// hello' } },
  entities: [
    {
      id: 'e1',
      bodyType: 'dynamic',
      shape: { type: 'box', width: 1, height: 1, depth: 1 },
      position: [0, 0, 0],
      scripts: ['my_script'],
    },
  ],
}

const worldWithSharedScript: RennWorld = {
  ...minimalWorld,
  scripts: { shared_scr: { event: 'onUpdate', source: '// x' } },
  entities: [
    {
      id: 'e1',
      bodyType: 'dynamic',
      shape: { type: 'box', width: 1, height: 1, depth: 1 },
      position: [0, 0, 0],
      scripts: ['shared_scr'],
    },
    {
      id: 'e2',
      bodyType: 'dynamic',
      shape: { type: 'box', width: 1, height: 1, depth: 1 },
      position: [1, 0, 0],
      scripts: ['shared_scr'],
    },
  ],
}

function renderWorkspace(ui: ReactElement) {
  return render(
    <CopyProvider>
      <EditorUndoProvider value={undoApi}>{ui}</EditorUndoProvider>
    </CopyProvider>,
  )
}

describe('Workspace', () => {
  beforeEach(() => {
    monacoMount.count = 0
    resetWorkspaceEditorInitialRefreshForTests()
    let persisted: GlobalBehaviorLibrary = { transformers: {}, scripts: {} }
    vi.spyOn(defaultPersistence, 'loadGlobalBehaviorLibrary').mockImplementation(async () => persisted)
    vi.spyOn(defaultPersistence, 'saveGlobalBehaviorLibrary').mockImplementation(async (next: GlobalBehaviorLibrary) => {
      persisted = {
        transformers: { ...next.transformers },
        scripts: { ...next.scripts },
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    clearCustomTransformerRuntimeError()
  })

  it('renders nothing when closed', () => {
    renderWorkspace(
      <Workspace
        open={false}
        onClose={vi.fn()}
        entry={null}
        world={minimalWorld}
        selectedEntityIds={['e1']}
        onWorldChange={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('workspace-panel')).not.toBeInTheDocument()
  })

  it('remounts Monaco after workspace opens on a Monaco tab (first time only)', () => {
    vi.useFakeTimers()
    monacoMount.count = 0
    const { rerender } = renderWorkspace(
      <Workspace
        open={false}
        onClose={vi.fn()}
        entry={{ entityId: 'e1', tab: 'scripts', itemId: 'my_script' }}
        world={worldWithScript}
        selectedEntityIds={['e1']}
        onWorldChange={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('mock-monaco-editor')).not.toBeInTheDocument()

    act(() => {
      rerender(
        <CopyProvider>
          <EditorUndoProvider value={undoApi}>
            <Workspace
              open
              onClose={vi.fn()}
              entry={{ entityId: 'e1', tab: 'scripts', itemId: 'my_script' }}
              world={worldWithScript}
              selectedEntityIds={['e1']}
              onWorldChange={vi.fn()}
            />
          </EditorUndoProvider>
        </CopyProvider>,
      )
    })

    expect(screen.getByTestId('mock-monaco-editor')).toBeInTheDocument()
    const mountsAfterOpen = monacoMount.count

    act(() => {
      vi.advanceTimersByTime(WORKSPACE_EDITOR_OPEN_REFRESH_MS)
    })
    expect(monacoMount.count).toBeGreaterThan(mountsAfterOpen)
  })

  it('remounts Monaco after switching from Organize to a Monaco tab on first open', () => {
    vi.useFakeTimers()
    monacoMount.count = 0
    renderWorkspace(
      <Workspace
        open
        onClose={vi.fn()}
        entry={{ tab: 'organize' }}
        world={worldWithScript}
        selectedEntityIds={['e1']}
        onWorldChange={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('mock-monaco-editor')).not.toBeInTheDocument()

    act(() => {
      fireEvent.click(screen.getByTestId('workspace-tab-scripts'))
    })
    expect(screen.getByTestId('mock-monaco-editor')).toBeInTheDocument()
    const mountsAfterTabSwitch = monacoMount.count

    act(() => {
      vi.advanceTimersByTime(WORKSPACE_EDITOR_OPEN_REFRESH_MS)
    })
    expect(monacoMount.count).toBeGreaterThan(mountsAfterTabSwitch)
  })

  it('does not remount Monaco again when workspace is closed and reopened', () => {
    vi.useFakeTimers()
    monacoMount.count = 0
    const { rerender } = renderWorkspace(
      <Workspace
        open
        onClose={vi.fn()}
        entry={{ entityId: 'e1', tab: 'scripts', itemId: 'my_script' }}
        world={worldWithScript}
        selectedEntityIds={['e1']}
        onWorldChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('mock-monaco-editor')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(WORKSPACE_EDITOR_OPEN_REFRESH_MS)
    })
    const mountsAfterFirstRefresh = monacoMount.count

    act(() => {
      rerender(
        <CopyProvider>
          <EditorUndoProvider value={undoApi}>
            <Workspace
              open={false}
              onClose={vi.fn()}
              entry={{ entityId: 'e1', tab: 'scripts', itemId: 'my_script' }}
              world={worldWithScript}
              selectedEntityIds={['e1']}
              onWorldChange={vi.fn()}
            />
          </EditorUndoProvider>
        </CopyProvider>,
      )
    })
    expect(screen.queryByTestId('mock-monaco-editor')).not.toBeInTheDocument()

    act(() => {
      rerender(
        <CopyProvider>
          <EditorUndoProvider value={undoApi}>
            <Workspace
              open
              onClose={vi.fn()}
              entry={{ entityId: 'e1', tab: 'scripts', itemId: 'my_script' }}
              world={worldWithScript}
              selectedEntityIds={['e1']}
              onWorldChange={vi.fn()}
            />
          </EditorUndoProvider>
        </CopyProvider>,
      )
    })
    expect(screen.getByTestId('mock-monaco-editor')).toBeInTheDocument()
    const mountsAfterReopen = monacoMount.count

    act(() => {
      vi.advanceTimersByTime(WORKSPACE_EDITOR_OPEN_REFRESH_MS)
    })
    expect(monacoMount.count).toBe(mountsAfterReopen)
    expect(monacoMount.count).toBeGreaterThan(mountsAfterFirstRefresh)
  })

  it('opens full-screen shell with tabs and shared editor placeholder', () => {
    renderWorkspace(
      <Workspace
        open
        onClose={vi.fn()}
        entry={{ entityId: 'e1', tab: 'transformers', itemId: 'tf_a' }}
        world={minimalWorld}
        selectedEntityIds={['e1']}
        onWorldChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('workspace-panel')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-tab-transformers')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('workspace-tab-scripts')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('mock-monaco-editor')).toBeInTheDocument()
  })

  it('opens with Scripts tab when entry requests scripts', async () => {
    renderWorkspace(
      <Workspace
        open
        onClose={vi.fn()}
        entry={{ entityId: 'e1', tab: 'scripts', itemId: 'my_script' }}
        world={worldWithScript}
        selectedEntityIds={['e1']}
        onWorldChange={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('workspace-tab-scripts')).toHaveAttribute('aria-selected', 'true')
    })
    expect(screen.getByTestId('workspace-shell-entity-search-label')).toHaveTextContent(/e1 · my_script/)
    expect(screen.getByTestId('workspace-script-chip-my_script')).toBeInTheDocument()
  })

  it('switching to Organize unmounts Monaco; returning to Scripts remounts one editor', async () => {
    renderWorkspace(
      <Workspace
        open
        onClose={vi.fn()}
        entry={{ entityId: 'e1', tab: 'scripts' }}
        world={minimalWorld}
        selectedEntityIds={['e1']}
        onWorldChange={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('workspace-tab-scripts')).toHaveAttribute('aria-selected', 'true')
    })
    expect(screen.getAllByTestId('mock-monaco-editor').length).toBe(1)
    fireEvent.click(screen.getByTestId('workspace-tab-organize'))
    expect(screen.getByTestId('workspace-tab-organize')).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByTestId('mock-monaco-editor')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('workspace-tab-scripts'))
    await waitFor(() => {
      expect(screen.getByTestId('workspace-tab-scripts')).toHaveAttribute('aria-selected', 'true')
    })
    expect(screen.getAllByTestId('mock-monaco-editor').length).toBe(1)
  })

  it('Organize tab lists project scripts', async () => {
    renderWorkspace(
      <Workspace
        open
        onClose={vi.fn()}
        entry={{ entityId: 'e1', tab: 'organize', organize: { scope: 'project', kind: 'scripts' } }}
        world={worldWithScript}
        selectedEntityIds={['e1']}
        onWorldChange={vi.fn()}
        onEntryChange={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('workspace-tab-organize')).toHaveAttribute('aria-selected', 'true')
    })
    expect(screen.getByTestId('workspace-organize-tab')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-organize-card-script-my_script')).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    renderWorkspace(
      <Workspace
        open
        onClose={onClose}
        entry={{ entityId: 'e1', tab: 'transformers' }}
        world={minimalWorld}
        selectedEntityIds={['e1']}
        onWorldChange={vi.fn()}
      />,
    )
    fireEvent.keyDown(document, { key: 'Escape', shiftKey: false })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when clicking the × control', () => {
    const onClose = vi.fn()
    renderWorkspace(
      <Workspace
        open
        onClose={onClose}
        entry={{ entityId: 'e1', tab: 'transformers' }}
        world={minimalWorld}
        selectedEntityIds={['e1']}
        onWorldChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('workspace-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Transformers tab shows horizontal pipeline for registry-linked stack', async () => {
    renderWorkspace(
      <Workspace
        open
        onClose={vi.fn()}
        entry={{ entityId: 'e1', tab: 'transformers', itemId: 'e1_tf0', pipeNavPath: [{ kind: 'stack', index: 0 }] }}
        world={worldWithTransformer}
        selectedEntityIds={['e1']}
        onWorldChange={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('workspace-tab-transformers')).toHaveAttribute('aria-selected', 'true')
    })
    // Wait for the transformer pipeline to be rendered
    await waitFor(() => {
      expect(screen.getByTestId('transformer-horizontal-item-0')).toBeInTheDocument()
    })
  })

  it('Scripts Manage opens Organize scoped to Entity · Scripts', async () => {
    const onExternalEntryChange = vi.fn()
    function Harness() {
      const [entry, setEntry] = useState<WorkspaceTarget>({
        entityId: 'e1',
        tab: 'scripts',
        itemId: 'my_script',
      })
      return (
        <Workspace
          open
          onClose={vi.fn()}
          entry={entry}
          onEntryChange={(next) => {
            onExternalEntryChange(next)
            setEntry(next)
          }}
          world={worldWithScript}
          selectedEntityIds={['e1']}
          onWorldChange={vi.fn()}
        />
      )
    }
    renderWorkspace(<Harness />)
    await waitFor(() => {
      expect(screen.getByTestId('workspace-tab-scripts')).toHaveAttribute('aria-selected', 'true')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Manage' }))
    await waitFor(() => {
      expect(screen.getByTestId('workspace-tab-organize')).toHaveAttribute('aria-selected', 'true')
    })
    expect(screen.getByTestId('workspace-organize-scope-entity')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('workspace-organize-kind-scripts')).toHaveAttribute('aria-selected', 'true')
    expect(onExternalEntryChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'e1',
        tab: 'organize',
        organize: { scope: 'entity', kind: 'scripts' },
      }),
    )
  })

  it('shows shared-script banner when the script is on multiple entities', async () => {
    renderWorkspace(
      <Workspace
        open
        onClose={vi.fn()}
        entry={{ entityId: 'e1', tab: 'scripts', itemId: 'shared_scr' }}
        world={worldWithSharedScript}
        selectedEntityIds={['e1']}
        onWorldChange={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('workspace-shared-script-banner')).toHaveTextContent(/shared/i)
      expect(screen.getByTestId('workspace-shared-script-banner')).toHaveTextContent(/e2/)
    })
  })

  it('fires onEntryChange when switching shell tabs', async () => {
    const onEntryChange = vi.fn()
    renderWorkspace(
      <Workspace
        open
        onClose={vi.fn()}
        entry={{ entityId: 'e1', tab: 'scripts', itemId: 'my_script' }}
        world={worldWithScript}
        selectedEntityIds={['e1']}
        onWorldChange={vi.fn()}
        onEntryChange={onEntryChange}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('workspace-tab-scripts')).toHaveAttribute('aria-selected', 'true')
    })
    fireEvent.click(screen.getByTestId('workspace-tab-transformers'))
    expect(onEntryChange).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'e1', tab: 'transformers', itemId: 'my_script' }),
    )
  })

  it('promoting a transformer to Global lists it under Global scope', async () => {
    renderWorkspace(
      <Workspace
        open
        onClose={vi.fn()}
        entry={{ entityId: 'e1', tab: 'organize', organize: { scope: 'project', kind: 'transformers' } }}
        world={worldWithTransformer}
        selectedEntityIds={['e1']}
        onWorldChange={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('workspace-organize-card-tf-e1_tf0')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('workspace-organize-card-tf-e1_tf0-promote'))
    fireEvent.click(screen.getByTestId('workspace-organize-scope-global'))
    await waitFor(() => {
      expect(screen.getByTestId('workspace-organize-card-global-tf-e1_tf0')).toBeInTheDocument()
    })
  })

  it('toggles transformer documentation panel from shell header', async () => {
    renderWorkspace(
      <Workspace
        open
        onClose={vi.fn()}
        entry={{ entityId: 'e1', tab: 'transformers', itemId: 'e1_tf0' }}
        world={worldWithTransformer}
        selectedEntityIds={['e1']}
        onWorldChange={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('workspace-docs-toggle')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('workspace-docs-panel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('workspace-docs-toggle'))
    await waitFor(() => {
      expect(screen.getByTestId('workspace-docs-panel')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('workspace-docs-close'))
    await waitFor(() => {
      expect(screen.queryByTestId('workspace-docs-panel')).not.toBeInTheDocument()
    })
  })

  it('shows conflict dialog when promoting the same transformer to Global twice', async () => {
    renderWorkspace(
      <Workspace
        open
        onClose={vi.fn()}
        entry={{ entityId: 'e1', tab: 'organize', organize: { scope: 'project', kind: 'transformers' } }}
        world={worldWithTransformer}
        selectedEntityIds={['e1']}
        onWorldChange={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('workspace-organize-card-tf-e1_tf0-promote')).toBeInTheDocument()
    })
    const promoteBtn = screen.getByTestId('workspace-organize-card-tf-e1_tf0-promote')
    fireEvent.click(promoteBtn)
    fireEvent.click(promoteBtn)
    await waitFor(() => {
      expect(screen.getByTestId('workspace-conflict-overwrite')).toBeInTheDocument()
      expect(screen.getByTestId('workspace-conflict-rename')).toBeInTheDocument()
    })
  })
})
