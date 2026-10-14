import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import BuilderHeader from './BuilderHeader'

const noop = (): void => {}

vi.mock('@/hooks/useProjectContext', () => ({
  useProjectContext: () => ({
    projects: [],
    currentProject: { id: null, name: 'Test', isDirty: false },
    exportProject: noop,
    copyWorldToClipboard: noop,
    importProject: noop,
    refreshProjects: noop,
    deleteProject: noop,
    handlePlay: noop,
    fileInputRef: createRef<HTMLInputElement>(),
    onFileChange: noop,
  }),
}))

vi.mock('@/utils/discoverExampleWorldIds', () => ({
  discoverExampleWorldIdsFromBuild: () => [
    'hunt',
    'crux_holdout_1',
    'crux_train_1',
    'maze_train_1',
    'policy_chains_maze',
    'policy_v3_free',
    'wf_maze_1',
    'world1',
  ],
}))

async function openFileMenu(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'File' }))
}

async function openExampleWorldsSubmenu(): Promise<void> {
  const user = userEvent.setup()
  await openFileMenu(user)
  // The submenu stays disabled until the example world ids resolve (fetch fallback in tests).
  const submenuItem = await screen.findByRole('menuitem', { name: /Example Worlds/ })
  await waitFor(() => {
    expect(submenuItem).not.toHaveAttribute('aria-disabled', 'true')
  })
  // Plain click (no hover): the submenu toggles open, whereas a hovered click would close it again.
  fireEvent.click(submenuItem)
}

describe('BuilderHeader example worlds menu', () => {
  const baseProps = {
    onNew: noop,
    onSave: noop,
    onSaveAs: noop,
    onOpen: noop,
    onReload: noop,
    onResetCamera: noop,
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hides training worlds (maze/crux/wf/policy) from the Example Worlds submenu; only non-training examples stay', async () => {
    // DEV-mode example world list API: fail so the menu falls back to build discovery (mocked above).
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    render(
      <BuilderHeader {...baseProps} gizmoMode="translate" onGizmoModeChange={noop} />,
    )
    await openExampleWorldsSubmenu()
    expect(await screen.findByText('world1')).toBeInTheDocument()
    expect(screen.getByText('hunt')).toBeInTheDocument()
    expect(screen.queryByText('policy_chains_maze')).not.toBeInTheDocument()
    expect(screen.queryByText('policy_v3_free')).not.toBeInTheDocument()
    // every playable training world lives in the Training dialog only, never in the global menu
    expect(screen.queryByText('maze_train_1')).not.toBeInTheDocument()
    expect(screen.queryByText('crux_train_1')).not.toBeInTheDocument()
    expect(screen.queryByText('crux_holdout_1')).not.toBeInTheDocument()
    expect(screen.queryByText('wf_maze_1')).not.toBeInTheDocument()
  })

  it('offers ONE merged "Training…" entry which calls onOpenTraining (no per-set entries)', async () => {
    const user = userEvent.setup()
    const onOpenTraining = vi.fn()
    render(
      <BuilderHeader
        {...baseProps}
        gizmoMode="translate"
        onGizmoModeChange={noop}
        onOpenTraining={onOpenTraining}
      />,
    )
    await openFileMenu(user)
    const item = screen.getByRole('menuitem', { name: 'Training…' })
    expect(item).toBeInTheDocument()
    await user.click(item)
    expect(onOpenTraining).toHaveBeenCalledTimes(1)
    // the separate per-set dialog entries are gone (merged into the tabbed dialog)
    expect(screen.queryByRole('menuitem', { name: /Training Mazes…/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Training Crux…/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Widen-freeze Worlds…/ })).not.toBeInTheDocument()
  })
})
