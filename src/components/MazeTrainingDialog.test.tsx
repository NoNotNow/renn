import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MazeTrainingDialog from './MazeTrainingDialog'
import { theme } from '@/config/theme'
import { MAZE_TRAINING_WORLDS, type MazeTrainingMeta } from '@/policyEvolution/mazeTraining'
import {
  clearTransformerWatchEntries,
  publishTransformerWatchEntry,
  setTransformerWatchEnabled,
} from '@/runtime/transformerWatchBridge'

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

/** Tile fixture: shared svg pixel size, one chain polyline (6 points) per route, per-route scores. */
const TILE_PTS: Array<Array<[number, number]>> = [
  [
    [10, 10],
    [40, 50],
    [70, 30],
    [100, 80],
    [130, 60],
    [160, 110],
  ],
]
const TILE_SCORES = [161, 150, null, 140]

function makeMeta(
  spec: { id: string; seed: number; name: string },
  bestScore: number | null,
  routes?: { forward: number; reversed: number },
): MazeTrainingMeta {
  const routeCount = routes ? routes.forward + routes.reversed : 0
  return {
    id: spec.id,
    seed: spec.seed,
    name: spec.name,
    candidate: { policy: 'v3', label: 'v3 shipped (gen 1000)', gen: 1000, source: 'shipped' },
    bestScore,
    chain: { points: 42, lengthM: 336 },
    ...(routes ? { routes } : {}),
    ...(routeCount > 0
      ? {
          tileSvg: {
            w: 206,
            h: 220,
            routes: Array.from({ length: routeCount }, (_, i) => ({
              pts: TILE_PTS[0].map((p) => [...p] as [number, number]),
              score: TILE_SCORES[i] ?? null,
            })),
          },
        }
      : {}),
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
    clearTransformerWatchEntries()
  })

  afterEach(() => {
    clearTransformerWatchEntries()
    setTransformerWatchEnabled(false)
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

  it('a row click expands its route tiles (one per way); tiles are individually clickable and select the run target vector', async () => {
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, 123, { forward: 3, reversed: 1 }))
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />)
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await screen.findAllByText('Best: 123 pts')
    const row1 = screen.getByTestId('maze-training-row-maze_train_1')
    await user.click(row1)
    expect(row1).toHaveAttribute('aria-expanded', 'true')
    // 4 tiles: 3 forward + 1 reversed, each with its own route image, fixed-height thumbnail and its own route score
    for (let i = 0; i < 4; i++) {
      const tile = screen.getByTestId(`maze-training-route-tile-maze_train_1-${i}`)
      expect(tile).toBeInTheDocument()
      const img = screen.getByTestId(`maze-training-thumb-maze_train_1-${i}`)
      expect(img).toHaveAttribute('src', expect.stringContaining(`route_${i}.svg`))
      expect(img).toHaveStyle({ height: '6em' })
    }
    expect(screen.getByTestId('maze-training-route-tile-maze_train_1-3')).toHaveAttribute(
      'aria-label',
      'Maze Training 1 way 4 (reversed)',
    )
    expect(screen.getAllByText('v3 shipped (gen 1000)')).toHaveLength(1)
    // per-route scores under the thumbnails (null score renders an em dash)
    expect(screen.getByText('Score: 161 pts')).toBeInTheDocument()
    expect(screen.getByText('Score: 150 pts')).toBeInTheDocument()
    expect(screen.getByText('Score: —')).toBeInTheDocument()
    expect(screen.getByText('Score: 140 pts')).toBeInTheDocument()
    // the loud active-vector overlay chip is gone entirely
    expect(screen.queryByTestId(/maze-training-active-vector-/)).not.toBeInTheDocument()
    // default: way 1 selected — calm accent border, no glow, no background tint
    const initiallySelected = screen.getByTestId('maze-training-route-tile-maze_train_1-0')
    expect(initiallySelected).toHaveStyle({ borderColor: theme.accent, background: theme.bg.surface })
    expect((initiallySelected as HTMLElement).style.boxShadow).toBe('')
    // click a tile: it becomes the selected target vector (only one pressed)
    await user.click(screen.getByTestId('maze-training-route-tile-maze_train_1-2'))
    expect(screen.getByTestId('maze-training-route-tile-maze_train_1-2')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('maze-training-route-tile-maze_train_1-0')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('maze-training-route-tile-maze_train_1-2')).toHaveStyle({ borderColor: theme.accent })
    expect((screen.getByTestId('maze-training-route-tile-maze_train_1-2') as HTMLElement).style.boxShadow).toBe('')
    // clicking a different tile moves the selection to that tile
    await user.click(screen.getByTestId('maze-training-route-tile-maze_train_1-1'))
    expect(screen.getByTestId('maze-training-route-tile-maze_train_1-1')).toHaveStyle({ borderColor: theme.accent })
    expect(screen.getByTestId('maze-training-route-tile-maze_train_1-2')).toHaveStyle({
      borderColor: theme.border.default,
    })
    // clicking the row line again collapses to the single line
    await user.click(row1)
    expect(screen.queryByTestId('maze-training-route-tile-maze_train_1-0')).not.toBeInTheDocument()
    expect(screen.queryByText('v3 shipped (gen 1000)')).not.toBeInTheDocument()
  })

  it('Play loads the selected route (default 0, tile click changes it)', async () => {
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }))
    const onPlay = vi.fn()
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={onPlay} />)
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await screen.findAllByText('Best: 10 pts')
    // default: route 0
    await user.click(screen.getByTestId('maze-training-play-maze_train_3'))
    expect(onPlay).toHaveBeenCalledWith('maze_train_3', 0)
    // select way 3 (reversed) via its tile, then play that run
    await user.click(screen.getByTestId('maze-training-row-maze_train_3'))
    await user.click(screen.getByTestId('maze-training-route-tile-maze_train_3-3'))
    await user.click(screen.getByTestId('maze-training-play-maze_train_3'))
    expect(onPlay).toHaveBeenLastCalledWith('maze_train_3', 3)
    expect(onPlay).toHaveBeenCalledTimes(2)
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
    expect(onPlay).toHaveBeenCalledWith('maze_train_3', 0)
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

  it('shows the live score line and the live active-vector overlay for the focused route', async () => {
    setTransformerWatchEnabled(true)
    publishTransformerWatchEntry({ entityId: 'policy_car_body_1', configStackIndex: 2, label: 'maze.score', value: '123 pts' })
    publishTransformerWatchEntry({ entityId: 'policy_car_body_1', configStackIndex: 2, label: 'maze.seg', value: '3' })
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, 123, { forward: 3, reversed: 1 }))
    render(
      <MazeTrainingDialog
        isOpen
        onClose={() => {}}
        onPlayExampleWorld={() => {}}
        liveRun={{ worldId: 'maze_train_1', routeIndex: 1 }}
      />,
    )
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await screen.findAllByText('Best: 123 pts')
    await user.click(screen.getByTestId('maze-training-row-maze_train_1'))
    // live score line next to the candidate label, only in the live world's expanded row
    expect(screen.getByText('Live: 123 pts')).toBeInTheDocument()
    // the focused route's thumbnail carries the live vector overlay (dim chain + glowing active segment)
    const overlay = screen.getByTestId('maze-training-live-vector-maze_train_1-1')
    expect(overlay).toBeInTheDocument()
    expect(overlay.querySelector('polyline')).not.toBeNull()
    expect(overlay.querySelectorAll('line')).toHaveLength(2)
    // only the focused route gets the overlay
    expect(screen.queryByTestId('maze-training-live-vector-maze_train_1-0')).not.toBeInTheDocument()
    expect(screen.queryByTestId('maze-training-live-vector-maze_train_1-2')).not.toBeInTheDocument()
  })

  it('shows only the dim chain polyline when no live segment is known yet', async () => {
    setTransformerWatchEnabled(true)
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, 123, { forward: 3, reversed: 1 }))
    render(
      <MazeTrainingDialog
        isOpen
        onClose={() => {}}
        onPlayExampleWorld={() => {}}
        liveRun={{ worldId: 'maze_train_1', routeIndex: 1 }}
      />,
    )
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await screen.findAllByText('Best: 123 pts')
    await user.click(screen.getByTestId('maze-training-row-maze_train_1'))
    expect(screen.getByText('Live: -')).toBeInTheDocument()
    const overlay = screen.getByTestId('maze-training-live-vector-maze_train_1-1')
    expect(overlay.querySelector('polyline')).not.toBeNull()
    expect(overlay.querySelectorAll('line')).toHaveLength(0)
  })

  it('renders no overlay and no live score line without a liveRun or for another world', async () => {
    setTransformerWatchEnabled(true)
    publishTransformerWatchEntry({ entityId: 'policy_car_body_0', configStackIndex: 2, label: 'maze.score', value: '55 pts' })
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, 123, { forward: 3, reversed: 1 }))
    const { rerender } = render(
      <MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />,
    )
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await screen.findAllByText('Best: 123 pts')
    await user.click(screen.getByTestId('maze-training-row-maze_train_1'))
    expect(screen.queryByText(/Live:/)).not.toBeInTheDocument()
    expect(screen.queryByTestId(/maze-training-live-vector-/)).not.toBeInTheDocument()
    // liveRun pointing at another world: maze_train_1 stays non-live
    rerender(
      <MazeTrainingDialog
        isOpen
        onClose={() => {}}
        onPlayExampleWorld={() => {}}
        liveRun={{ worldId: 'maze_train_2', routeIndex: 0 }}
      />,
    )
    expect(screen.queryByText(/Live:/)).not.toBeInTheDocument()
    expect(screen.queryByTestId(/maze-training-live-vector-/)).not.toBeInTheDocument()
  })
})
