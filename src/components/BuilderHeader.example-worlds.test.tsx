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
    'maze_train_1',
    'policy_chains_maze',
    'policy_v3_free',
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

  it('hides policy_* and maze training worlds from the Example Worlds submenu', async () => {
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
    expect(screen.queryByText('maze_train_1')).not.toBeInTheDocument()
  })

  it('offers "Training Mazes…" which calls onOpenMazeTraining', async () => {
    const user = userEvent.setup()
    const onOpenMazeTraining = vi.fn()
    render(
      <BuilderHeader
        {...baseProps}
        gizmoMode="translate"
        onGizmoModeChange={noop}
        onOpenMazeTraining={onOpenMazeTraining}
      />,
    )
    await openFileMenu(user)
    const item = screen.getByRole('menuitem', { name: /Training Mazes…/ })
    expect(item).toBeInTheDocument()
    await user.click(item)
    expect(onOpenMazeTraining).toHaveBeenCalledTimes(1)
  })
})
