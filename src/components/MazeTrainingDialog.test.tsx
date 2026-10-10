import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'
import MazeTrainingDialog from './MazeTrainingDialog'
import { MAZE_TRAINING_WORLDS, type MazeTrainingMeta } from '@/policyEvolution/mazeTraining'

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
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders one list row per registered maze world (list view is the default)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />)
    expect(screen.queryAllByTestId(/^maze-training-card-/)).toHaveLength(0)
    for (const spec of MAZE_TRAINING_WORLDS) {
      expect(screen.getByTestId(`maze-training-row-${spec.id}`)).toBeInTheDocument()
      expect(screen.getByText(spec.name)).toBeInTheDocument()
      expect(screen.getByText(`seed ${spec.seed}`)).toBeInTheDocument()
    }
    expect(screen.getAllByTestId(/^maze-training-row-/)).toHaveLength(MAZE_TRAINING_WORLDS.length)
  })

  it('shows "not exported yet" and a disabled play button when meta fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const onPlay = vi.fn()
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={onPlay} />)
    await waitFor(() => {
      expect(screen.getAllByText('not exported yet')).toHaveLength(MAZE_TRAINING_WORLDS.length)
    })
    for (const spec of MAZE_TRAINING_WORLDS) {
      expect(screen.getByTestId(`maze-training-play-${spec.id}`)).toBeDisabled()
    }
    fireEvent.click(screen.getByTestId('maze-training-play-maze_train_3'))
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('expands the thumbnail inline on row click and collapses on second click', async () => {
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, 10))
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />)
    await screen.findAllByText('Best: 10 pts')
    expect(screen.queryByTestId('maze-training-thumb-maze_train_2')).not.toBeInTheDocument()
    const row = screen.getByTestId('maze-training-row-maze_train_2')
    await user.click(row)
    const thumb = screen.getByTestId('maze-training-thumb-maze_train_2')
    expect(thumb).toHaveAttribute('src', expect.stringContaining('thumb.svg'))
    await user.click(row)
    expect(screen.queryByTestId('maze-training-thumb-maze_train_2')).not.toBeInTheDocument()
  })

  it('shows candidate, best score and routes; Play loads the maze and keeps the dialog open', async () => {
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, spec.id === 'maze_train_3' ? null : 123, { forward: 3, reversed: 1 }))
    const onPlay = vi.fn()
    const onClose = vi.fn()
    render(<MazeTrainingDialog isOpen onClose={onClose} onPlayExampleWorld={onPlay} />)
    await screen.findAllByText('v3 shipped (gen 1000)')
    expect(screen.getAllByText('Best: 123 pts')).toHaveLength(4)
    expect(screen.getAllByText('Best: —')).toHaveLength(1)
    expect(screen.getAllByText('3 ways · 1 reversed')).toHaveLength(MAZE_TRAINING_WORLDS.length)
    expect(screen.queryByText('not exported yet')).not.toBeInTheDocument()
    const row = screen.getByTestId('maze-training-row-maze_train_3')
    expect(row).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByTestId('maze-training-play-maze_train_3'))
    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(onPlay).toHaveBeenCalledWith('maze_train_3')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('maze-training-row-maze_train_3')).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders rows when the meta.json predates the routes field', async () => {
    stubFetchWithMeta((spec) => makeMeta(spec, 77))
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />)
    await screen.findAllByText('Best: 77 pts')
    expect(screen.queryByText(/reversed/)).not.toBeInTheDocument()
    for (const spec of MAZE_TRAINING_WORLDS) {
      expect(screen.getByTestId(`maze-training-row-${spec.id}`)).toBeInTheDocument()
    }
  })

  it('switches to the cards view behind the header toggle', async () => {
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, 5, { forward: 3, reversed: 1 }))
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />)
    await screen.findAllByText('Best: 5 pts')
    expect(screen.queryAllByTestId(/^maze-training-card-/)).toHaveLength(0)
    await user.click(screen.getByTestId('maze-training-view-cards'))
    for (const spec of MAZE_TRAINING_WORLDS) {
      expect(screen.getByTestId(`maze-training-card-${spec.id}`)).toBeInTheDocument()
    }
    await user.click(screen.getByTestId('maze-training-view-list'))
    expect(screen.queryAllByTestId(/^maze-training-card-/)).toHaveLength(0)
    expect(screen.getAllByTestId(/^maze-training-row-/)).toHaveLength(MAZE_TRAINING_WORLDS.length)
  })
})
