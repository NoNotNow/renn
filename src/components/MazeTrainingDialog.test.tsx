import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MazeTrainingDialog from './MazeTrainingDialog'
import { CRUX_TRAINING_SET } from './trainingSets'
import { theme } from '@/config/theme'
import { MAZE_TRAINING_WORLDS, type MazeTrainingMeta } from '@/policyEvolution/mazeTraining'
import { CRUX_TRAINING_WORLDS, cruxTrainingInfo, type CruxTrainingMeta } from '@/policyEvolution/cruxTraining'
import type { MazeCandidate } from '@/policyEvolution/mazeCandidates'
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

/** jsdom normalizes hsl() in the background shorthand to rgb(); run the expected color through the same path. */
function normalizedBackground(css: string): string {
  const probe = document.createElement('span')
  probe.style.background = css
  return probe.style.background
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

function stubFetchWithMeta(
  make: (spec: (typeof MAZE_TRAINING_WORLDS)[number]) => MazeTrainingMeta,
  candidates?: MazeCandidate[],
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.includes('policy-evolution/candidates.json')) {
        if (!candidates) throw new Error('offline')
        return {
          ok: true,
          json: async () => ({
            schema: 'renn.policy-evolution.candidates/1',
            source: 'training-data/policy-evolution/v3mg7.json',
            policy: 'v3',
            gen: 42,
            updatedAt: '2026-10-11T00:00:00.000Z',
            candidates,
          }),
        }
      }
      const match = url.match(/exampleWorlds\/([^/]+)\/meta\.json$/)
      const id = decodeURIComponent(match?.[1] ?? '')
      const spec = MAZE_TRAINING_WORLDS.find((s) => s.id === id)
      if (!spec) throw new Error(`unexpected fetch: ${url}`)
      return { ok: true, json: async () => make(spec) }
    }),
  )
}

/** Candidate fixture: minimal valid candidate (the dialog only reads id/label/gen/genome/detail/scores). */
function makeCandidate(
  id: string,
  label: string,
  scores?: Record<string, { best: number; routes: Array<number | null> }>,
): MazeCandidate {
  return { id, label, gen: 42, genome: [1, 2, 3], detail: `${label} detail`, ...(scores ? { scores, scoredGen: 42 } : {}) }
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
    // offline: no meta loaded -> no totals in the header strip
    expect(screen.queryByTestId('maze-training-header-totals')).not.toBeInTheDocument()
    expect(screen.queryByTestId('maze-training-header-health')).not.toBeInTheDocument()
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
    // every row also shows the weakest link: the worst measured route score plus its way number
    // (TILE_SCORES min is 140 at route index 3 -> way 4)
    expect(screen.getAllByText('Worst: 140 pts · way 4')).toHaveLength(MAZE_TRAINING_WORLDS.length)
    expect(screen.getAllByText('3 ways · 1 reversed')).toHaveLength(MAZE_TRAINING_WORLDS.length)
    // header totals: sum of the bests (9x123, one world null) and of the worsts (10x140)
    expect(screen.getByTestId('maze-training-header-totals')).toHaveTextContent('Σ Best: 1107 pts · Σ Worst: 1400 pts')
    // header health dot: Σ Worst (1400) ÷ Σ Best (1107) > 1 clamps to full health -> green
    expect(screen.getByTestId('maze-training-header-health').style.background).toBe(normalizedBackground('hsl(120, 75%, 45%)'))
    // every row carries its own health dot: worst (140) ÷ best (123) > 1 -> green; the null-best world stays gray
    const rowDots = screen.getAllByTestId(/^maze-training-row-health-/)
    expect(rowDots).toHaveLength(MAZE_TRAINING_WORLDS.length)
    const green = normalizedBackground('hsl(120, 75%, 45%)')
    expect(rowDots.filter((dot) => dot.style.background === green)).toHaveLength(MAZE_TRAINING_WORLDS.length - 1)
    expect(rowDots.filter((dot) => dot.style.background === normalizedBackground(theme.text.muted))).toHaveLength(1)
    expect(screen.getByTestId('maze-training-resize-handle')).toBeInTheDocument()
  })

  it('colors the header health dot red when the stuck routes score zero', async () => {
    // best 100 per world, route 2 stuck at 0 -> Σ Best 1000, Σ Worst 0 -> health 0 -> red
    const pts = TILE_PTS[0].map((p) => [...p] as [number, number])
    stubFetchWithMeta((spec) => ({
      ...makeMeta(spec, 100, { forward: 2, reversed: 0 }),
      tileSvg: { w: 206, h: 220, routes: [{ pts, score: 100 }, { pts, score: 0 }] },
    }))
    const user = userEvent.setup()
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />)
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await screen.findAllByText('Best: 100 pts')
    expect(screen.getByTestId('maze-training-header-totals')).toHaveTextContent('Σ Best: 1000 pts · Σ Worst: 0 pts')
    expect(screen.getByTestId('maze-training-header-health').style.background).toBe(normalizedBackground('hsl(0, 75%, 45%)'))
    // per-row dot: worst (0) ÷ best (100) = 0 -> red on all rows
    const rowDots = screen.getAllByTestId(/^maze-training-row-health-/)
    expect(rowDots).toHaveLength(MAZE_TRAINING_WORLDS.length)
    for (const dot of rowDots) expect(dot.style.background).toBe(normalizedBackground('hsl(0, 75%, 45%)'))
  })

  it('a row click expands its route tiles (one per way); clicking a tile selects the way it started', async () => {
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
      expect(img).toHaveStyle({ height: '8.4em' })
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
    // click a tile: it starts the run on that way and stays marked as the started way (only one pressed)
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

  it('clicking a route tile starts the run on that way', async () => {
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }))
    const onPlay = vi.fn()
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={onPlay} />)
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await screen.findAllByText('Best: 10 pts')
    // There is no default-route-0 start: a run can only be started through a tile.
    await user.click(screen.getByTestId('maze-training-row-maze_train_3'))
    await user.click(screen.getByTestId('maze-training-route-tile-maze_train_3-3'))
    expect(onPlay).toHaveBeenCalledWith('maze_train_3', 3, null)
    // starting another way of the same run reports that route instead
    await user.click(screen.getByTestId('maze-training-route-tile-maze_train_3-1'))
    expect(onPlay).toHaveBeenLastCalledWith('maze_train_3', 1, null)
    expect(onPlay).toHaveBeenCalledTimes(2)
    // keyboard Enter on a tile starts that way too
    const tile2 = screen.getByTestId('maze-training-route-tile-maze_train_3-2')
    tile2.focus()
    await user.keyboard('{Enter}')
    expect(onPlay).toHaveBeenLastCalledWith('maze_train_3', 2, null)
    expect(onPlay).toHaveBeenCalledTimes(3)
  })

  it('starting a run via a tile keeps the panel open and expanded', async () => {
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 3, reversed: 1 }))
    const onPlay = vi.fn()
    const onClose = vi.fn()
    render(<MazeTrainingDialog isOpen onClose={onClose} onPlayExampleWorld={onPlay} />)
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await screen.findAllByText('Best: 10 pts')
    expect(screen.getByTestId('maze-training-row-maze_train_3')).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByTestId('maze-training-row-maze_train_3'))
    await user.click(screen.getByTestId('maze-training-route-tile-maze_train_3-0'))
    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(onPlay).toHaveBeenCalledWith('maze_train_3', 0, null)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('maze-training-panel-header')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('maze-training-row-maze_train_3')).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders candidate chips from candidates.json; a chip click selects the candidate and the next tile start carries it', async () => {
    const user = userEvent.setup()
    const candidates = [makeCandidate('island-0', 'I1'), makeCandidate('island-1', 'I2'), makeCandidate('island-2', 'I3'), makeCandidate('best', 'Best'), makeCandidate('shipped', 'Shipped')]
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }), candidates)
    const onPlay = vi.fn()
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={onPlay} />)
    await screen.findAllByTestId('maze-training-candidates')
    for (const c of candidates) {
      expect(screen.getByTestId(`maze-training-candidate-chip-${c.id}`)).toHaveTextContent(c.label)
    }
    // nothing selected: all chips unpressed, no accent border
    expect(screen.getByTestId('maze-training-candidate-chip-island-0')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('maze-training-candidate-chip-island-0')).not.toHaveStyle({ borderColor: theme.accent })
    // selecting a candidate marks the chip and persists the choice
    await user.click(screen.getByTestId('maze-training-candidate-chip-island-0'))
    expect(screen.getByTestId('maze-training-candidate-chip-island-0')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('maze-training-candidate-chip-island-0')).toHaveStyle({ borderColor: theme.accent })
    expect(window.localStorage.getItem('mazeTrainingPanelCandidate')).toBe(JSON.stringify('island-0'))
    // the next tile start carries the selected candidate
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await user.click(screen.getByTestId('maze-training-row-maze_train_3'))
    await user.click(screen.getByTestId('maze-training-route-tile-maze_train_3-1'))
    expect(onPlay).toHaveBeenLastCalledWith('maze_train_3', 1, expect.objectContaining({ id: 'island-0' }))
    // clicking the active chip again returns to the deployed candidate (null) and persists that too
    await user.click(screen.getByTestId('maze-training-candidate-chip-island-0'))
    expect(screen.getByTestId('maze-training-candidate-chip-island-0')).toHaveAttribute('aria-pressed', 'false')
    expect(window.localStorage.getItem('mazeTrainingPanelCandidate')).toBe(JSON.stringify(null))
    await user.click(screen.getByTestId('maze-training-route-tile-maze_train_3-2'))
    expect(onPlay).toHaveBeenLastCalledWith('maze_train_3', 2, null)
  })

  it('the health dots follow the selected candidate (its headless scores), not the deployed meta', async () => {
    // deployed meta: best 123, worst route 150 -> green; island-0's scores: best 100, worst route 10 -> hsl(12)
    const scores: Record<string, { best: number; routes: Array<number | null> }> = {}
    for (const spec of MAZE_TRAINING_WORLDS) scores[spec.id] = { best: 100, routes: [100, 10] }
    const candidates = [makeCandidate('island-0', 'I1', scores), makeCandidate('island-1', 'I2')]
    stubFetchWithMeta((spec) => makeMeta(spec, 123, { forward: 2, reversed: 0 }), candidates)
    const user = userEvent.setup()
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />)
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await screen.findAllByText('Best: 123 pts')
    const headerDot = () => screen.getByTestId('maze-training-header-health')
    const rowDots = () => screen.getAllByTestId(/^maze-training-row-health-/)
    const green = normalizedBackground('hsl(120, 75%, 45%)')
    // deployed candidate (no chip active): worst 150 ÷ best 123 > 1 clamps to green
    expect(headerDot().style.background).toBe(green)
    expect(rowDots()).toHaveLength(MAZE_TRAINING_WORLDS.length)
    for (const dot of rowDots()) expect(dot.style.background).toBe(green)
    // selecting island-0 switches every dot to ITS scores: worst 10 ÷ best 100 -> hsl(12)
    await user.click(screen.getByTestId('maze-training-candidate-chip-island-0'))
    const islandHue = normalizedBackground('hsl(12, 75%, 45%)')
    expect(headerDot().style.background).toBe(islandHue)
    for (const dot of rowDots()) expect(dot.style.background).toBe(islandHue)
    // a candidate without shipped scores (older deploy) -> gray everywhere, NOT the deployed colors
    await user.click(screen.getByTestId('maze-training-candidate-chip-island-1'))
    expect(headerDot().style.background).toBe(normalizedBackground(theme.text.muted))
    for (const dot of rowDots()) expect(dot.style.background).toBe(normalizedBackground(theme.text.muted))
    // deselecting returns to the deployed candidate's colors
    await user.click(screen.getByTestId('maze-training-candidate-chip-island-1'))
    expect(headerDot().style.background).toBe(green)
    for (const dot of rowDots()) expect(dot.style.background).toBe(green)
  })

  it('a chip click re-loads the live run with the new candidate when a run is driving', async () => {
    const user = userEvent.setup()
    const candidates = [makeCandidate('island-1', 'I2'), makeCandidate('best', 'Best')]
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }), candidates)
    const onPlay = vi.fn()
    render(
      <MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={onPlay} liveRun={{ worldId: 'maze_train_2', routeIndex: 1 }} />,
    )
    await screen.findAllByTestId('maze-training-candidates')
    await user.click(screen.getByTestId('maze-training-candidate-chip-best'))
    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(onPlay).toHaveBeenLastCalledWith('maze_train_2', 1, expect.objectContaining({ id: 'best' }))
    // switching to the other candidate re-loads the same live run with it
    await user.click(screen.getByTestId('maze-training-candidate-chip-island-1'))
    expect(onPlay).toHaveBeenLastCalledWith('maze_train_2', 1, expect.objectContaining({ id: 'island-1' }))
    // deselect re-loads with the deployed candidate
    await user.click(screen.getByTestId('maze-training-candidate-chip-island-1'))
    expect(onPlay).toHaveBeenLastCalledWith('maze_train_2', 1, null)
  })

  it('restores a persisted candidate selection; an id the file no longer lists is dropped', async () => {
    const user = userEvent.setup()
    const storage = stubLocalStorage()
    storage.set('mazeTrainingPanelCandidate', JSON.stringify('island-2'))
    const candidates = [makeCandidate('island-2', 'I3'), makeCandidate('best', 'Best')]
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }), candidates)
    const onPlay = vi.fn()
    const { unmount } = render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={onPlay} />)
    await screen.findAllByTestId('maze-training-candidates')
    expect(screen.getByTestId('maze-training-candidate-chip-island-2')).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await user.click(screen.getByTestId('maze-training-row-maze_train_1'))
    await user.click(screen.getByTestId('maze-training-route-tile-maze_train_1-0'))
    expect(onPlay).toHaveBeenLastCalledWith('maze_train_1', 0, expect.objectContaining({ id: 'island-2' }))
    // a stale persisted id (candidates.json re-exported, candidate gone) falls back to the deployed candidate
    storage.set('mazeTrainingPanelCandidate', JSON.stringify('island-9'))
    unmount()
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }), [makeCandidate('best', 'Best')])
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={onPlay} />)
    await screen.findByTestId('maze-training-candidate-chip-best')
    expect(screen.getByTestId('maze-training-candidate-chip-best')).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders no candidate chips when candidates.json is missing (older deploy)', async () => {
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }))
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />)
    await screen.findByTestId('maze-training-header-totals')
    expect(screen.queryByTestId('maze-training-candidates')).not.toBeInTheDocument()
  })

  it('shows "not exported yet" and renders no route tiles (no way to start the run) when meta fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const user = userEvent.setup()
    const onPlay = vi.fn()
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={onPlay} />)
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await waitFor(() => {
      expect(screen.getAllByText('not exported yet')).toHaveLength(MAZE_TRAINING_WORLDS.length)
    })
    // tiles only render for exported worlds, so no run can be started
    expect(screen.queryAllByTestId(/maze-training-route-tile-/)).toHaveLength(0)
    // no meta -> no Best/Worst labels and no row health dots either
    expect(screen.queryAllByTestId(/^maze-training-row-health-/)).toHaveLength(0)
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
    // no per-route scores -> no worst score either
    expect(screen.getAllByText('Worst: —')).toHaveLength(MAZE_TRAINING_WORLDS.length)
    // header totals: bests sum (10x77), no worst data at all
    expect(screen.getByTestId('maze-training-header-totals')).toHaveTextContent('Σ Best: 770 pts · Σ Worst: —')
    // Σ Worst unmeasured -> the health dot stays gray
    expect(screen.getByTestId('maze-training-header-health').style.background).toBe(normalizedBackground(theme.text.muted))
    // rows: best measured but no per-route scores -> every row dot stays gray too
    const rowDots = screen.getAllByTestId(/^maze-training-row-health-/)
    expect(rowDots).toHaveLength(MAZE_TRAINING_WORLDS.length)
    for (const dot of rowDots) expect(dot.style.background).toBe(normalizedBackground(theme.text.muted))
    for (const spec of MAZE_TRAINING_WORLDS) {
      expect(screen.getByTestId(`maze-training-card-${spec.id}`)).toBeInTheDocument()
    }
  })

  it('shows the worst route score with its way number (weakest link per row)', async () => {
    // 2 forward + 2 reversed routes; TILE_SCORES applies in tile order (null = unmeasured is ignored)
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }))
    const user = userEvent.setup()
    render(<MazeTrainingDialog isOpen onClose={() => {}} onPlayExampleWorld={() => {}} />)
    await user.click(screen.getByTestId('maze-training-panel-header'))
    await screen.findAllByText('Best: 10 pts')
    // min over the measured routes: 140 at index 3 -> "Worst: 140 pts · way 4" (the reversed way 4)
    expect(screen.getAllByText('Worst: 140 pts · way 4')).toHaveLength(MAZE_TRAINING_WORLDS.length)
    // the culprit way's own tile score matches the row label
    await user.click(screen.getByTestId('maze-training-row-maze_train_2'))
    expect(screen.getByText('Score: 140 pts')).toBeInTheDocument()
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

// --- the training-crux set: the SAME parameterized dialog on CRUX_TRAINING_SET -----------------------------------

describe('MazeTrainingDialog (Training Crux set)', () => {
  beforeEach(() => {
    stubLocalStorage()
    clearTransformerWatchEntries()
  })

  afterEach(() => {
    clearTransformerWatchEntries()
    setTransformerWatchEnabled(false)
    vi.unstubAllGlobals()
  })

  /** Crux meta fixture: base + jittered chains, per-chain tile pts + scores, the class band fields. */
  function makeCruxMeta(id: string, bestScore: number | null): CruxTrainingMeta {
    const spec = CRUX_TRAINING_WORLDS.find((s) => s.id === id)!
    return {
      id,
      setupKey: spec.setupKey,
      name: spec.name,
      candidate: { policy: 'v3', label: 'v3 shipped (gen 1000)', gen: 1000, source: 'shippedPolicyV3.json' },
      bestScore,
      cls: 0,
      emb: 0,
      dir: -1,
      chain: { points: 12, lengthM: 36.4 },
      chains: { base: 1, jittered: 5 },
      tileSvg: {
        w: 127,
        h: 220,
        routes: Array.from({ length: 6 }, (_, i) => ({
          pts: TILE_PTS[0].map((p) => [...p] as [number, number]),
          score: i === 2 ? null : 40 - i,
        })),
      },
    } as CruxTrainingMeta
  }

  it('renders the Training Crux panel: own title, crux testids, class info chips, chain badge', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input)
        if (url.includes('policy-evolution/candidates.json')) throw new Error('offline')
        const match = url.match(/exampleWorlds\/([^/]+)\/meta\.json$/)
        const id = decodeURIComponent(match?.[1] ?? '')
        if (!CRUX_TRAINING_WORLDS.some((s) => s.id === id)) throw new Error(`unexpected fetch: ${url}`)
        return { ok: true, json: async () => makeCruxMeta(id, 43) }
      }),
    )
    render(<MazeTrainingDialog isOpen trainingSet={CRUX_TRAINING_SET} onClose={() => {}} onPlayExampleWorld={() => {}} />)
    // the maze panel testids stay absent; the crux ones carry the crux prefix + the crux title
    expect(screen.queryByTestId('maze-training-panel')).not.toBeInTheDocument()
    const header = screen.getByTestId('crux-training-panel-header')
    expect(header).toBeInTheDocument()
    expect(screen.getByText('Training Crux')).toBeInTheDocument()
    expect(screen.getByText(`${CRUX_TRAINING_WORLDS.length} runs`)).toBeInTheDocument()
    await user.click(header)
    for (const spec of CRUX_TRAINING_WORLDS) {
      expect(screen.getByTestId(`crux-training-card-${spec.id}`)).toBeInTheDocument()
      expect(screen.getByText(spec.name)).toBeInTheDocument()
      // the row info chip is the class / embodiment / direction line (the maze rows show "seed 2001");
      // several worlds of the band share a class/embodiment/direction combo, so count per line
      expect(screen.getAllByText(cruxTrainingInfo(spec)).length).toBeGreaterThan(0)
    }
    // the weakest-link noun is "chain", the badge names the chains (not "ways / reversed"); the fixture's
    // tile scores are [40, 39, null, 37, 36, 35] -> the worst is 35 on chain 6
    expect(screen.getAllByText('Worst: 35 pts · chain 6')).toHaveLength(CRUX_TRAINING_WORLDS.length)
    expect(screen.getAllByText('6 chains')).toHaveLength(CRUX_TRAINING_WORLDS.length)
    expect(screen.queryByText(/reversed/)).not.toBeInTheDocument()
    // the crux panel carries the same header health dot: Σ Best 25x43, Σ Worst 25x35 -> health 875/1075
    expect(screen.getByTestId('crux-training-header-health').style.background).toBe(normalizedBackground('hsl(98, 75%, 45%)'))
    // and the same per-row dots: worst (35) ÷ best (43) -> health 35/43
    const rowDots = screen.getAllByTestId(/^crux-training-row-health-/)
    expect(rowDots).toHaveLength(CRUX_TRAINING_WORLDS.length)
    for (const dot of rowDots) expect(dot.style.background).toBe(normalizedBackground('hsl(98, 75%, 45%)'))
  })

  it('expands base + jitter chain tiles; a tile click starts the run on that chain', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input)
        if (url.includes('policy-evolution/candidates.json')) throw new Error('offline')
        const match = url.match(/exampleWorlds\/([^/]+)\/meta\.json$/)
        const id = decodeURIComponent(match?.[1] ?? '')
        if (!CRUX_TRAINING_WORLDS.some((s) => s.id === id)) throw new Error(`unexpected fetch: ${url}`)
        return { ok: true, json: async () => makeCruxMeta(id, 43) }
      }),
    )
    const onPlay = vi.fn()
    render(<MazeTrainingDialog isOpen trainingSet={CRUX_TRAINING_SET} onClose={() => {}} onPlayExampleWorld={onPlay} />)
    await user.click(screen.getByTestId('crux-training-panel-header'))
    await screen.findAllByText('6 chains')
    await user.click(screen.getByTestId('crux-training-row-crux_train_1'))
    // 6 tiles: the base path first (green start), then the jittered variants
    expect(screen.getByTestId('crux-training-route-tile-crux_train_1-0')).toHaveAttribute(
      'aria-label',
      'Crux Training 1 chain 1 (base path)',
    )
    expect(screen.getByTestId('crux-training-route-tile-crux_train_1-3')).toHaveAttribute(
      'aria-label',
      'Crux Training 1 chain 4 (jittered variant)',
    )
    expect(screen.getByText('Chain 4 (jitter)')).toBeInTheDocument()
    expect(screen.getByTestId('crux-training-thumb-crux_train_1-2')).toHaveAttribute('src', expect.stringContaining('route_2.svg'))
    await user.click(screen.getByTestId('crux-training-route-tile-crux_train_1-2'))
    expect(onPlay).toHaveBeenCalledWith('crux_train_1', 2, null)
  })

  it('reads the crux.* watch labels of the live run (live score + segment for the focused chain)', async () => {
    setTransformerWatchEnabled(true)
    publishTransformerWatchEntry({ entityId: 'policy_car_body_2', configStackIndex: 3, label: 'crux.score', value: '37 pts' })
    publishTransformerWatchEntry({ entityId: 'policy_car_body_2', configStackIndex: 3, label: 'crux.seg', value: '4' })
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input)
        if (url.includes('policy-evolution/candidates.json')) throw new Error('offline')
        const match = url.match(/exampleWorlds\/([^/]+)\/meta\.json$/)
        const id = decodeURIComponent(match?.[1] ?? '')
        if (!CRUX_TRAINING_WORLDS.some((s) => s.id === id)) throw new Error(`unexpected fetch: ${url}`)
        return { ok: true, json: async () => makeCruxMeta(id, 43) }
      }),
    )
    render(
      <MazeTrainingDialog
        isOpen
        trainingSet={CRUX_TRAINING_SET}
        onClose={() => {}}
        onPlayExampleWorld={() => {}}
        liveRun={{ worldId: 'crux_train_1', routeIndex: 2 }}
      />,
    )
    await user.click(screen.getByTestId('crux-training-panel-header'))
    await screen.findAllByText('6 chains')
    await user.click(screen.getByTestId('crux-training-row-crux_train_1'))
    expect(screen.getByText('Live: 37 pts')).toBeInTheDocument()
    const overlay = screen.getByTestId('crux-training-live-vector-crux_train_1-2')
    expect(overlay.querySelectorAll('line')).toHaveLength(2)
    // only the focused chain gets the overlay
    expect(screen.queryByTestId('crux-training-live-vector-crux_train_1-0')).not.toBeInTheDocument()
  })
})
