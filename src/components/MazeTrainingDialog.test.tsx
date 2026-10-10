import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MazeTrainingDialog from './MazeTrainingDialog'
import { MAZE_TRAINING_WORLDS, type MazeTrainingMeta } from '@/policyEvolution/mazeTraining'

/** Map-backed localStorage stub (jsdom in this setup lacks removeItem). */
function stubLocalStorage(): Map<string, string> {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
  })
  return storage
}

function makeMeta(
  spec: { id: string; seed: number; name: string },
  bestScore: number | null,
  routes?: { forward: number; reversed: number },
): MazeTrainingMeta {
  return {
    id: spec.id,
    seed: spec.seed,
    name: spec.name,
    candidate: { policy: 'v3', label: 'v3 shipped (gen 1000)', gen: 1000, source: 'shipped' },
    bestScore,
    chain: { points: 42, lengthM: 336 },
    ...(routes ? { routes } : {}),
  } as MazeTrainingMeta
}

function stubFetchWithMeta(make: (spec: (typeof MAZE_TRAINING_WORLDS)[number]) => MazeTrainingMeta) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input)
      const match = url.match(/exampleWorlds\/([^/]+)\/meta\.json$/)
      const id = decodeURIComponent(match?.[1] ?? '')
      const spec = MAZE_TRAINING_WORLDS.find((s) => s.id === id)
      if (!spec) throw new Error(`unexpected fetch: ${url}`)
      return { ok: true, json: async () => make(spec) }
    }),
  )
}

describe('MazeTrainingDialog', () => {
  beforeEach(() => {
    stubLocalStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the collapsed one-line strip by default (no thumbnails visible)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />)
    const header = screen.getByTestId('maze-training-panel-header')
    expect(header).toBeInTheDocument()
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Training Mazes')).toBeInTheDocument()
    expect(screen.getByText(`${MAZE_TRAINING_WORLDS.length} runs`)).toBeInTheDocument()
    expect(screen.queryAllByTestId(/^maze-training-card-/)).toHaveLength(0)
    expect(screen.queryByTestId('maze-training-resize-handle')).not.toBeInTheDocument()
  })

  it('expands into single-line run rows by default (no thumbnails visible)', async () => {
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, spec.id === 'maze_train_3' ? null : 123, { forward: 3, reversed: 1 }))
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />)
    await user.click(screen.getByTestId('maze-training-panel-header'))
    expect(screen.getByTestId('maze-training-panel-header')).toHaveAttribute('aria-expanded', 'true')
    for (const spec of MAZE_TRAINING_WORLDS) {
      expect(screen.getByTestId(`maze-training-card-${spec.id}`)).toBeInTheDocument()
      expect(screen.queryByTestId(`maze-training-thumb-${spec.id}`)).not.toBeInTheDocument()
      expect(screen.getByText(spec.name)).toBeInTheDocument()
      expect(screen.getByText(`seed ${spec.seed}`)).toBeInTheDocument()
    }
    expect(screen.getAllByText('Best: 123 pts')).toHaveLength(MAZE_TRAINING_WORLDS.length - 1)
    expect(screen.getAllByText('Best: —')).toHaveLength(1)
    expect(screen.getAllByText('3 ways · 1 reversed')).toHaveLength(MAZE_TRAINING_WORLDS.length)
    expect(screen.getByTestId('maze-training-resize-handle')).toBeInTheDocument()
  })

  it('a row click expands its full-width thumbnail (all vectors); accordion: one at a time, second click collapses', async () => {
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, 123, { forward: 3, reversed: 1 }))
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />)
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await screen.findAllByText('Best: 123 pts')
    const row1 = screen.getByTestId('maze-training-row-maze_train_1')
    await user.click(row1)
    const thumb1 = screen.getByTestId('maze-training-thumb-maze_train_1')
    expect(thumb1).toHaveAttribute('src', expect.stringContaining('thumb.svg'))
    expect(thumb1).toHaveAttribute('alt', expect.stringContaining('all guidance vectors'))
    expect(screen.getAllByText('v3 shipped (gen 1000)')).toHaveLength(1)
    expect(row1).toHaveAttribute('aria-expanded', 'true')
    // clicking another row switches the accordion
    await user.click(screen.getByTestId('maze-training-row-maze_train_2'))
    expect(screen.queryByTestId('maze-training-thumb-maze_train_1')).not.toBeInTheDocument()
    expect(screen.getByTestId('maze-training-thumb-maze_train_2')).toBeInTheDocument()
    // clicking the same row again collapses to the single line
    await user.click(screen.getByTestId('maze-training-row-maze_train_2'))
    expect(screen.queryByTestId('maze-training-thumb-maze_train_2')).not.toBeInTheDocument()
    expect(screen.queryByText('v3 shipped (gen 1000)')).not.toBeInTheDocument()
  })

  it('Play loads the maze and keeps the panel open and expanded', async () => {
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, 10))
    const onPlay = vi.fn()
    const onClose = vi.fn()
    render(<MazeTrainingDialog isOpen onClose={onClose} onPlayExampleWorld={onPlay} />)
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await screen.findAllByText('Best: 10 pts')
    expect(screen.getByTestId('maze-training-row-maze_train_3')).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByTestId('maze-training-play-maze_train_3'))
    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(onPlay).toHaveBeenCalledWith('maze_train_3')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('maze-training-panel-header')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('maze-training-row-maze_train_3')).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows "not exported yet" and a disabled play button when meta fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const user = userEvent.setup()
    const onPlay = vi.fn()
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={onPlay} />)
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await waitFor(() => {
      expect(screen.getAllByText('not exported yet')).toHaveLength(MAZE_TRAINING_WORLDS.length)
    })
    for (const spec of MAZE_TRAINING_WORLDS) {
      expect(screen.getByTestId(`maze-training-play-${spec.id}`)).toBeDisabled()
    }
    fireEvent.click(screen.getByTestId('maze-training-play-maze_train_3'))
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('close X calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<MazeTrainingDialog isOpen onClose={onClose} onPlayExampleWorld={() => {}} />)
    await user.click(screen.getByTestId('maze-training-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('collapses back to the strip on a second strip click and persists the state', async () => {
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, 5))
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />)
    const header = screen.getByTestId('maze-training-panel-header')
    await user.click(header)
    await screen.findAllByText('Best: 5 pts')
    expect(screen.getAllByTestId(/^maze-training-card-/)).toHaveLength(MAZE_TRAINING_WORLDS.length)
    await user.click(header)
    expect(screen.queryAllByTestId(/^maze-training-card-/)).toHaveLength(0)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(window.localStorage.getItem('mazeTrainingPanelCollapsed')).toBe(JSON.stringify(true))
  })

  it('renders cards when the meta.json predates the routes field', async () => {
    stubFetchWithMeta((spec) => makeMeta(spec, 77))
    const user = userEvent.setup()
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />)
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await screen.findAllByText('Best: 77 pts')
    expect(screen.queryByText(/reversed/)).not.toBeInTheDocument()
    for (const spec of MAZE_TRAINING_WORLDS) {
      expect(screen.getByTestId(`maze-training-card-${spec.id}`)).toBeInTheDocument()
    }
  })
})
