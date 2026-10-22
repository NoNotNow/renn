import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MazeTrainingDialog, { routeTileThumbHeightPx } from './MazeTrainingDialog'
import { CRUX_TRAINING_SET, trainingSetsOfCar, WF_TRAINING_SET } from './trainingSets'
import { theme } from '@/config/theme'
import { MAZE_TRAINING_WORLDS, type MazeTrainingMeta } from '@/policyEvolution/mazeTraining'
import { CRUX_TRAINING_WORLDS, cruxTrainingInfo, type CruxTrainingMeta } from '@/policyEvolution/cruxTraining'
import type { WfTrainingMeta } from '@/policyEvolution/wfCandidates'
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

/**
 * Picks a model through the grouped picker menu: opens it, switches to the group's tab, clicks the entry,
 * then closes the menu with its close button (a pick KEEPS the menu open for further picks).
 */
async function pickModel(
  user: ReturnType<typeof userEvent.setup>,
  groupTab: string,
  optionId: string,
  testidPrefix = 'maze',
) {
  await user.click(await screen.findByTestId(`${testidPrefix}-training-candidates`))
  await user.click(screen.getByTestId(`${testidPrefix}-training-candidates-tab-${groupTab}`))
  await user.click(screen.getByTestId(`${testidPrefix}-training-candidate-option-${optionId}`))
  await user.click(screen.getByTestId(`${testidPrefix}-training-candidates-menu-close`))
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

  it('renders the section immediately (sidebar mount): title line + rows fetch with no expand step and no floating chrome', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    render(<MazeTrainingDialog onPlayExampleWorld={() => {}} />)
    const header = screen.getByTestId('maze-training-panel-header')
    expect(header).toBeInTheDocument()
    expect(screen.getByText('Training Mazes')).toBeInTheDocument()
    expect(screen.getByText(`${MAZE_TRAINING_WORLDS.length} runs`)).toBeInTheDocument()
    // sidebar section: no fixed positioning, no drag/resize handles, no close button of the old floating dialog
    const panel = screen.getByTestId('maze-training-panel')
    expect(panel.style.position).toBe('')
    expect(screen.queryByTestId('maze-training-close')).not.toBeInTheDocument()
    expect(screen.queryAllByTestId(/^resize-handle-/)).toHaveLength(0)
    // offline: no meta loaded -> every row reports "not exported yet", no totals anywhere
    await waitFor(() => {
      expect(screen.getAllByText('not exported yet')).toHaveLength(MAZE_TRAINING_WORLDS.length)
    })
    expect(screen.queryByTestId('maze-training-header-totals')).not.toBeInTheDocument()
    expect(screen.queryByTestId('maze-training-header-health')).not.toBeInTheDocument()
    expect(screen.queryAllByTestId(/^maze-training-row-health-/)).toHaveLength(0)
  })

  it('renders single-line run rows by default (no thumbnails visible)', async () => {
    stubFetchWithMeta((spec) => makeMeta(spec, spec.id === 'maze_train_3' ? null : 123, { forward: 3, reversed: 1 }))
    render(<MazeTrainingDialog onPlayExampleWorld={() => {}} />)
    await screen.findAllByText('Best: 123 pts')
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
    // header title line: MEAN best (9x123 / 9) and MEAN worst (10x140 / 10), integers, no decimals
    expect(screen.getByTestId('maze-training-header-totals')).toHaveTextContent('Ø Best: 123 pts · Ø Worst: 140 pts')
    expect(screen.getByTestId('maze-training-header-totals').textContent).not.toContain('.')
    // header health dot: Ø Worst (140) ÷ Ø Best (123) > 1 clamps to full health -> green
    expect(screen.getByTestId('maze-training-header-health').style.background).toBe(normalizedBackground('hsl(120, 75%, 45%)'))
    // every row carries its own health dot: worst (140) ÷ best (123) > 1 -> green; the null-best world stays gray
    const rowDots = screen.getAllByTestId(/^maze-training-row-health-/)
    expect(rowDots).toHaveLength(MAZE_TRAINING_WORLDS.length)
    const green = normalizedBackground('hsl(120, 75%, 45%)')
    expect(rowDots.filter((dot) => dot.style.background === green)).toHaveLength(MAZE_TRAINING_WORLDS.length - 1)
    expect(rowDots.filter((dot) => dot.style.background === normalizedBackground(theme.text.muted))).toHaveLength(1)
    // sidebar section: no resize handles (the sidebar's own edge resizes the drawer, not the section)
    expect(screen.queryAllByTestId(/^resize-handle-/)).toHaveLength(0)
  })

  it('colors the header health dot red when the stuck routes score zero', async () => {
    // best 100 per world, route 2 stuck at 0 -> Ø Best 100, Ø Worst 0 -> health 0 -> red
    const pts = TILE_PTS[0].map((p) => [...p] as [number, number])
    stubFetchWithMeta((spec) => ({
      ...makeMeta(spec, 100, { forward: 2, reversed: 0 }),
      tileSvg: { w: 206, h: 220, routes: [{ pts, score: 100 }, { pts, score: 0 }] },
    }))
    render(<MazeTrainingDialog onPlayExampleWorld={() => {}} />)
    await screen.findAllByText('Best: 100 pts')
    expect(screen.getByTestId('maze-training-header-totals')).toHaveTextContent('Ø Best: 100 pts · Ø Worst: 0 pts')
    expect(screen.getByTestId('maze-training-header-health').style.background).toBe(normalizedBackground('hsl(0, 75%, 45%)'))
    // per-row dot: worst (0) ÷ best (100) = 0 -> red on all rows
    const rowDots = screen.getAllByTestId(/^maze-training-row-health-/)
    expect(rowDots).toHaveLength(MAZE_TRAINING_WORLDS.length)
    for (const dot of rowDots) expect(dot.style.background).toBe(normalizedBackground('hsl(0, 75%, 45%)'))
  })

  it('a row click expands its route tiles (one per way); clicking a tile selects the way it started', async () => {
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, 123, { forward: 3, reversed: 1 }))
    render(<MazeTrainingDialog onPlayExampleWorld={() => {}} />)
    await screen.findAllByText('Best: 123 pts')
    const row1 = screen.getByTestId('maze-training-row-maze_train_1')
    await user.click(row1)
    expect(row1).toHaveAttribute('aria-expanded', 'true')
    // 4 tiles: 3 forward + 1 reversed, each with its own route image, section-size-scaled thumbnail
    // (jsdom keeps the 300x600 sidebar fallback -> width-bound 65px) and its own route score
    for (let i = 0; i < 4; i++) {
      const tile = screen.getByTestId(`maze-training-route-tile-maze_train_1-${i}`)
      expect(tile).toBeInTheDocument()
      const img = screen.getByTestId(`maze-training-thumb-maze_train_1-${i}`)
      expect(img).toHaveAttribute('src', expect.stringContaining(`route_${i}.svg`))
      expect(img).toHaveStyle({ height: '65px' })
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
    render(<MazeTrainingDialog onPlayExampleWorld={onPlay} />)
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

  it('starting a run via a tile keeps the section mounted and the row selected', async () => {
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 3, reversed: 1 }))
    const onPlay = vi.fn()
    render(<MazeTrainingDialog onPlayExampleWorld={onPlay} />)
    await screen.findAllByText('Best: 10 pts')
    expect(screen.getByTestId('maze-training-row-maze_train_3')).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByTestId('maze-training-row-maze_train_3'))
    await user.click(screen.getByTestId('maze-training-route-tile-maze_train_3-0'))
    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(onPlay).toHaveBeenCalledWith('maze_train_3', 0, null)
    // the section stays exactly as it was: rows mounted, the started row selected
    expect(screen.getByTestId('maze-training-panel')).toBeInTheDocument()
    expect(screen.getByTestId('maze-training-row-maze_train_3')).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders the tabbed model picker from candidates.json; a pick persists and the next tile start carries it', async () => {
    const user = userEvent.setup()
    const candidates = [makeCandidate('island-0', 'I1'), makeCandidate('island-1', 'I2'), makeCandidate('island-2', 'I3'), makeCandidate('best', 'Best'), makeCandidate('shipped', 'Shipped')]
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }), candidates)
    const onPlay = vi.fn()
    render(<MazeTrainingDialog onPlayExampleWorld={onPlay} />)
    // the picker trigger lives in its own row under the header; the menu is closed by default
    const trigger = await screen.findByTestId('maze-training-candidates')
    expect(trigger).toHaveTextContent('Deployed (export)')
    expect(screen.queryByTestId('maze-training-candidates-menu')).not.toBeInTheDocument()
    // opening the trigger lands on the Deployed tab (nothing selected) with its entry pressed
    await user.click(trigger)
    expect(screen.getByTestId('maze-training-candidates-tab-deployed')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('maze-training-candidate-option-deployed')).toHaveAttribute('aria-pressed', 'true')
    // picking a candidate (via its group tab) KEEPS the menu open: the pick is active immediately
    await user.click(screen.getByTestId('maze-training-candidates-tab-islands'))
    await user.click(screen.getByTestId('maze-training-candidate-option-island-0'))
    expect(screen.getByTestId('maze-training-candidates-menu')).toBeInTheDocument()
    expect(screen.getByTestId('maze-training-candidate-option-island-0')).toHaveAttribute('aria-pressed', 'true')
    expect(trigger).toHaveTextContent('I1')
    expect(trigger).toHaveStyle({ borderColor: theme.accent })
    expect(window.localStorage.getItem('mazeTrainingPanelCandidate')).toBe(JSON.stringify('island-0'))
    // the next tile start carries the selected candidate (the tile click closes the menu as an outside click)
    await user.click(screen.getByTestId('maze-training-row-maze_train_3'))
    await user.click(screen.getByTestId('maze-training-route-tile-maze_train_3-1'))
    expect(onPlay).toHaveBeenLastCalledWith('maze_train_3', 1, expect.objectContaining({ id: 'island-0' }))
    expect(screen.queryByTestId('maze-training-candidates-menu')).not.toBeInTheDocument()
    // reopening follows the SELECTED candidate's group (its tab active), not the deployed default
    await user.click(trigger)
    expect(screen.getByTestId('maze-training-candidates-tab-islands')).toHaveAttribute('aria-selected', 'true')
    // the deployed entry returns to the baked-in candidate (null) and persists that too
    await user.click(screen.getByTestId('maze-training-candidates-tab-deployed'))
    await user.click(screen.getByTestId('maze-training-candidate-option-deployed'))
    expect(trigger).toHaveTextContent('Deployed (export)')
    expect(trigger).not.toHaveStyle({ borderColor: theme.accent })
    expect(window.localStorage.getItem('mazeTrainingPanelCandidate')).toBe(JSON.stringify(null))
    // the close button closes the open menu
    await user.click(screen.getByTestId('maze-training-candidates-menu-close'))
    expect(screen.queryByTestId('maze-training-candidates-menu')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('maze-training-route-tile-maze_train_3-2'))
    expect(onPlay).toHaveBeenLastCalledWith('maze_train_3', 2, null)
  })

  it('tabs the menu by group with an icon per tab; Escape closes, so does a trigger re-click', async () => {
    const user = userEvent.setup()
    const candidates = [
      makeCandidate('wf_ra1_rel_g40', 'R1 R g40'),
      makeCandidate('wf_fs2_g250', 'FS2 g250'),
      makeCandidate('wf_of2a_df_g600', 'OF2A df g600'),
      makeCandidate('wf_of2a_g100', 'OF2A g100'),
      makeCandidate('mystery', 'M'),
      makeCandidate('island-0', 'I1'),
      makeCandidate('wf32_final', 'WF32'),
      makeCandidate('best', 'Best'),
    ]
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }), candidates)
    render(<MazeTrainingDialog onPlayExampleWorld={() => {}} />)
    await user.click(await screen.findByTestId('maze-training-candidates'))
    // the tab bar carries one tab per group (deployed first), each with an icon + short label
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Deployed', 'Islands', 'Milestones', 'Ships', 'Runs', 'Other'])
    for (const tab of tabs) expect(tab.querySelector('svg')).not.toBeNull()
    // default panel: only the deployed entry renders
    expect(screen.getByTestId('maze-training-candidate-option-deployed')).toBeInTheDocument()
    expect(screen.queryByTestId('maze-training-candidate-option-island-0')).not.toBeInTheDocument()
    // switching tabs shows that group's explainer + entries and hides the previous group
    await user.click(screen.getByTestId('maze-training-candidates-tab-islands'))
    expect(screen.getByText('Live centers of the running island training.')).toBeInTheDocument()
    expect(screen.getByTestId('maze-training-candidate-option-island-0')).toBeInTheDocument()
    expect(screen.queryByTestId('maze-training-candidate-option-deployed')).not.toBeInTheDocument()
    // the Runs tab sub-categorizes its checkpoints by run family: one sub-tab per family under the
    // group tabs — only the ACTIVE family's entries render, the families do not stack
    await user.click(screen.getByTestId('maze-training-candidates-tab-wf-runs'))
    const subtabIds = screen
      .getAllByTestId(/^maze-training-candidates-subtab-/)
      .map((el) => el.dataset.testid?.replace('maze-training-candidates-subtab-', ''))
    expect(subtabIds).toEqual(['of2a', 'of2a-df', 'shaping', 'rangieren'])
    // default: the first family is active; the other families' entries stay out of the document
    const of2a = screen.getByTestId('maze-training-candidates-subgroup-of2a')
    expect(of2a).toContainElement(screen.getByTestId('maze-training-candidate-option-wf_of2a_g100'))
    expect(screen.queryByTestId('maze-training-candidates-subgroup-rangieren')).not.toBeInTheDocument()
    // a sub-tab click swaps to that family's entries (the previous family's block disappears)
    await user.click(screen.getByTestId('maze-training-candidates-subtab-of2a-df'))
    const detour = screen.getByTestId('maze-training-candidates-subgroup-of2a-df')
    expect(detour).toContainElement(screen.getByTestId('maze-training-candidate-option-wf_of2a_df_g600'))
    expect(detour).toHaveTextContent('Blockade and blocks pursuit.')
    expect(screen.queryByTestId('maze-training-candidates-subgroup-of2a')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('maze-training-candidates-subtab-rangieren'))
    const rangieren = screen.getByTestId('maze-training-candidates-subgroup-rangieren')
    expect(rangieren).toContainElement(screen.getByTestId('maze-training-candidate-option-wf_ra1_rel_g40'))
    expect(rangieren).toHaveTextContent('Rangieren shunting focus and release chunks.')
    await user.click(screen.getByTestId('maze-training-candidates-tab-wf-ships'))
    expect(screen.getByTestId('maze-training-candidate-option-wf32_final')).toBeInTheDocument()
    await user.click(screen.getByTestId('maze-training-candidates-tab-other'))
    expect(screen.getByTestId('maze-training-candidate-option-mystery')).toBeInTheDocument()
    // Escape closes the menu
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('maze-training-candidates-menu')).not.toBeInTheDocument()
    // re-clicking the open trigger toggles it closed again
    await user.click(screen.getByTestId('maze-training-candidates'))
    expect(screen.getByTestId('maze-training-candidates-menu')).toBeInTheDocument()
    await user.click(screen.getByTestId('maze-training-candidates'))
    expect(screen.queryByTestId('maze-training-candidates-menu')).not.toBeInTheDocument()
  })

  it('the model picker + Ø figures render in their OWN row under the header; the menu is portaled to body', async () => {
    const user = userEvent.setup()
    const candidates = [makeCandidate('island-0', 'I1'), makeCandidate('best', 'Best')]
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }), candidates)
    render(<MazeTrainingDialog onPlayExampleWorld={() => {}} />)
    await screen.findAllByText('Best: 10 pts')
    // the row sits under the header, carrying the picker trigger AND the Ø figures
    const row = screen.getByTestId('maze-training-candidates-row')
    expect(row).toContainElement(screen.getByTestId('maze-training-candidates'))
    expect(row).toContainElement(screen.getByTestId('maze-training-header-totals'))
    expect(row).toContainElement(screen.getByTestId('maze-training-header-health'))
    expect(screen.getByTestId('maze-training-header-totals')).toHaveTextContent('Ø Best: 10 pts · Ø Worst: 140 pts')
    // the grouped menu is portaled to document.body (NOT inside the row); it carries a close button and
    // shows its entries behind the group tabs (island-0 lives on the Islands tab, not the deployed default)
    await user.click(screen.getByTestId('maze-training-candidates'))
    const menu = screen.getByTestId('maze-training-candidates-menu')
    expect(menu).toContainElement(screen.getByTestId('maze-training-candidate-option-deployed'))
    expect(menu).toContainElement(screen.getByTestId('maze-training-candidates-menu-close'))
    await user.click(screen.getByTestId('maze-training-candidates-tab-islands'))
    expect(menu).toContainElement(screen.getByTestId('maze-training-candidate-option-island-0'))
    expect(row).not.toContainElement(screen.getByTestId('maze-training-candidate-option-island-0'))
    // an outside click closes the menu
    await user.click(document.body)
    expect(screen.queryByTestId('maze-training-candidates-menu')).not.toBeInTheDocument()
    // the title line itself is slim: no picker, no Ø figures in the header
    const header = screen.getByTestId('maze-training-panel-header')
    expect(header).not.toContainElement(screen.getByTestId('maze-training-candidates'))
    expect(header).not.toContainElement(screen.getByTestId('maze-training-header-totals'))
  })

  it('the picker menu keeps its tab bar fixed above the scrolling entries and resizes from its corner', async () => {
    const user = userEvent.setup()
    const candidates = [makeCandidate('island-0', 'I1'), makeCandidate('best', 'Best')]
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }), candidates)
    render(<MazeTrainingDialog onPlayExampleWorld={() => {}} />)
    await user.click(await screen.findByTestId('maze-training-candidates'))
    const menu = screen.getByTestId('maze-training-candidates-menu')
    // the panel itself does not scroll (its entries body does); the group tab bar sits OUTSIDE the
    // scrolling tabpanel, so it stays put while the entries scroll
    expect(menu.style.overflowY).toBe('')
    expect(screen.getByTestId('maze-training-candidates-tab-islands').closest('[role="tabpanel"]')).toBeNull()
    // the bottom-right corner drag sets an explicit size (floors at 288×160, clamped to the viewport)
    const handle = screen.getByTestId('maze-training-candidates-menu-resize')
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: 'mouse', clientX: 500, clientY: 400 })
    fireEvent.pointerUp(handle, { pointerId: 1, pointerType: 'mouse' })
    expect(menu.style.width).toBe('400px')
    expect(menu.style.height).toBe('300px')
    // the drag itself never closed the menu (the handle is inside the panel)
    expect(screen.getByTestId('maze-training-candidates-menu')).toBeInTheDocument()
    // a shrinking drag floors at the minimum size (jsdom rect is 0×0, so the deltas hit the floors)
    fireEvent.pointerDown(handle, { button: 0, pointerId: 2, pointerType: 'mouse', clientX: 500, clientY: 400 })
    fireEvent.pointerMove(handle, { pointerId: 2, pointerType: 'mouse', clientX: 420, clientY: 350 })
    fireEvent.pointerUp(handle, { pointerId: 2, pointerType: 'mouse' })
    expect(menu.style.width).toBe('288px')
    expect(menu.style.height).toBe('160px')
  })

  it('the picker selection survives across mounts (the candidate slot persists per set)', async () => {
    const user = userEvent.setup()
    const candidates = [makeCandidate('best', 'Best')]
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }), candidates)
    const { unmount } = render(<MazeTrainingDialog onPlayExampleWorld={() => {}} />)
    await pickModel(user, 'milestones', 'best')
    unmount()
    render(<MazeTrainingDialog onPlayExampleWorld={() => {}} />)
    // the remounted section restores the selected model from its own persisted slot
    expect(await screen.findByTestId('maze-training-candidates')).toHaveTextContent('Best')
  })

  it('the health dots follow the selected candidate (its headless scores), not the deployed meta', async () => {
    // deployed meta: best 123, worst route 150 -> green; island-0's scores: best 100, worst route 10 -> hsl(12)
    const scores: Record<string, { best: number; routes: Array<number | null> }> = {}
    for (const spec of MAZE_TRAINING_WORLDS) scores[spec.id] = { best: 100, routes: [100, 10] }
    const candidates = [makeCandidate('island-0', 'I1', scores), makeCandidate('island-1', 'I2')]
    stubFetchWithMeta((spec) => makeMeta(spec, 123, { forward: 2, reversed: 0 }), candidates)
    const user = userEvent.setup()
    render(<MazeTrainingDialog onPlayExampleWorld={() => {}} />)
    await screen.findAllByText('Best: 123 pts')
    const headerDot = () => screen.getByTestId('maze-training-header-health')
    const rowDots = () => screen.getAllByTestId(/^maze-training-row-health-/)
    const green = normalizedBackground('hsl(120, 75%, 45%)')
    // deployed candidate (nothing selected): worst 150 ÷ best 123 > 1 clamps to green
    expect(headerDot().style.background).toBe(green)
    expect(rowDots()).toHaveLength(MAZE_TRAINING_WORLDS.length)
    for (const dot of rowDots()) expect(dot.style.background).toBe(green)
    // picking island-0 switches every dot to ITS scores: worst 10 ÷ best 100 -> hsl(12)
    await pickModel(user, 'islands', 'island-0')
    const islandHue = normalizedBackground('hsl(12, 75%, 45%)')
    expect(headerDot().style.background).toBe(islandHue)
    for (const dot of rowDots()) expect(dot.style.background).toBe(islandHue)
    // a candidate without shipped scores (older deploy) -> gray everywhere, NOT the deployed colors
    await pickModel(user, 'islands', 'island-1')
    expect(headerDot().style.background).toBe(normalizedBackground(theme.text.muted))
    for (const dot of rowDots()) expect(dot.style.background).toBe(normalizedBackground(theme.text.muted))
    // the deployed entry returns to the deployed candidate's colors
    await pickModel(user, 'deployed', 'deployed')
    expect(headerDot().style.background).toBe(green)
    for (const dot of rowDots()) expect(dot.style.background).toBe(green)
  })

  it('the title-line best/worst are integer AVERAGES (not sums) that recompute on candidate switch', async () => {
    // deployed: only two measured worlds — bests 100 and 201 (mean 150.5 -> 151, never a decimal),
    // worst routes 150 and 150 (mean 150). A SUM would read 301/300 — the line must show the means.
    const candidates = [
      makeCandidate('island-0', 'I1', { maze_train_1: { best: 90, routes: [90, 10] } }),
    ]
    stubFetchWithMeta(
      (spec) =>
        spec.id === 'maze_train_1'
          ? makeMeta(spec, 100, { forward: 2, reversed: 0 })
          : spec.id === 'maze_train_2'
            ? makeMeta(spec, 201, { forward: 2, reversed: 0 })
            : makeMeta(spec, null),
      candidates,
    )
    const user = userEvent.setup()
    render(<MazeTrainingDialog onPlayExampleWorld={() => {}} />)
    await screen.findAllByText('Best: 201 pts')
    const totals = () => screen.getByTestId('maze-training-header-totals')
    // means, rounded to integers, no decimal places anywhere in the line
    expect(totals()).toHaveTextContent('Ø Best: 151 pts · Ø Worst: 150 pts')
    expect(totals().textContent).not.toContain('.')
    // picking a candidate RECOMPUTES the title line from that candidate's scores
    await pickModel(user, 'islands', 'island-0')
    expect(totals()).toHaveTextContent('Ø Best: 90 pts · Ø Worst: 10 pts')
    expect(totals().textContent).not.toContain('.')
    // the deployed entry returns the deployed candidate's averages
    await pickModel(user, 'deployed', 'deployed')
    expect(totals()).toHaveTextContent('Ø Best: 151 pts · Ø Worst: 150 pts')
  })

  it('a picker change re-loads the live run with the new candidate when a run is driving', async () => {
    const user = userEvent.setup()
    const candidates = [makeCandidate('island-1', 'I2'), makeCandidate('best', 'Best')]
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }), candidates)
    const onPlay = vi.fn()
    render(
      <MazeTrainingDialog onPlayExampleWorld={onPlay} liveRun={{ worldId: 'maze_train_2', routeIndex: 1 }} />,
    )
    await pickModel(user, 'milestones', 'best')
    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(onPlay).toHaveBeenLastCalledWith('maze_train_2', 1, expect.objectContaining({ id: 'best' }))
    // switching to the other candidate re-loads the same live run with it
    await pickModel(user, 'islands', 'island-1')
    expect(onPlay).toHaveBeenLastCalledWith('maze_train_2', 1, expect.objectContaining({ id: 'island-1' }))
    // the deployed entry re-loads with the deployed candidate
    await pickModel(user, 'deployed', 'deployed')
    expect(onPlay).toHaveBeenLastCalledWith('maze_train_2', 1, null)
  })

  it('restores a persisted candidate selection; an id the file no longer lists is dropped', async () => {
    const user = userEvent.setup()
    const storage = stubLocalStorage()
    storage.set('mazeTrainingPanelCandidate', JSON.stringify('island-2'))
    const candidates = [makeCandidate('island-2', 'I3'), makeCandidate('best', 'Best')]
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }), candidates)
    const onPlay = vi.fn()
    const { unmount } = render(<MazeTrainingDialog onPlayExampleWorld={onPlay} />)
    // the picker restores the persisted selection from its own slot
    expect(await screen.findByTestId('maze-training-candidates')).toHaveTextContent('I3')
    await user.click(screen.getByTestId('maze-training-row-maze_train_1'))
    await user.click(screen.getByTestId('maze-training-route-tile-maze_train_1-0'))
    expect(onPlay).toHaveBeenLastCalledWith('maze_train_1', 0, expect.objectContaining({ id: 'island-2' }))
    // a stale persisted id (candidates.json re-exported, candidate gone) falls back to the deployed candidate
    storage.set('mazeTrainingPanelCandidate', JSON.stringify('island-9'))
    unmount()
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }), [makeCandidate('best', 'Best')])
    render(<MazeTrainingDialog onPlayExampleWorld={onPlay} />)
    expect(await screen.findByTestId('maze-training-candidates')).toHaveTextContent('Deployed (export)')
  })

  it('renders no candidate chips when candidates.json is missing (older deploy)', async () => {
    stubFetchWithMeta((spec) => makeMeta(spec, 10, { forward: 2, reversed: 2 }))
    render(<MazeTrainingDialog onPlayExampleWorld={() => {}} />)
    await screen.findByTestId('maze-training-header-totals')
    expect(screen.queryByTestId('maze-training-candidates')).not.toBeInTheDocument()
  })

  it('shows "not exported yet" and renders no route tiles (no way to start the run) when meta fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const onPlay = vi.fn()
    render(<MazeTrainingDialog onPlayExampleWorld={onPlay} />)
    await waitFor(() => {
      expect(screen.getAllByText('not exported yet')).toHaveLength(MAZE_TRAINING_WORLDS.length)
    })
    // tiles only render for exported worlds, so no run can be started
    expect(screen.queryAllByTestId(/maze-training-route-tile-/)).toHaveLength(0)
    // no meta -> no Best/Worst labels and no row health dots either
    expect(screen.queryAllByTestId(/^maze-training-row-health-/)).toHaveLength(0)
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('renders cards when the meta.json predates the routes field', async () => {
    stubFetchWithMeta((spec) => makeMeta(spec, 77))
    render(<MazeTrainingDialog onPlayExampleWorld={() => {}} />)
    await screen.findAllByText('Best: 77 pts')
    expect(screen.queryByText(/reversed/)).not.toBeInTheDocument()
    // no per-route scores -> no worst score either
    expect(screen.getAllByText('Worst: —')).toHaveLength(MAZE_TRAINING_WORLDS.length)
    // header title line: MEAN best (10x77 / 10), no worst data at all
    expect(screen.getByTestId('maze-training-header-totals')).toHaveTextContent('Ø Best: 77 pts · Ø Worst: —')
    // Ø Worst unmeasured -> the health dot stays gray
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
    render(<MazeTrainingDialog onPlayExampleWorld={() => {}} />)
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
        onPlayExampleWorld={() => {}}
        liveRun={{ worldId: 'maze_train_1', routeIndex: 1 }}
      />,
    )
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
        onPlayExampleWorld={() => {}}
        liveRun={{ worldId: 'maze_train_1', routeIndex: 1 }}
      />,
    )
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
      <MazeTrainingDialog onPlayExampleWorld={() => {}} />,
    )
    await screen.findAllByText('Best: 123 pts')
    await user.click(screen.getByTestId('maze-training-row-maze_train_1'))
    expect(screen.queryByText(/Live:/)).not.toBeInTheDocument()
    expect(screen.queryByTestId(/maze-training-live-vector-/)).not.toBeInTheDocument()
    // liveRun pointing at another world: maze_train_1 stays non-live
    rerender(
      <MazeTrainingDialog
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
    render(<MazeTrainingDialog trainingSet={CRUX_TRAINING_SET} onPlayExampleWorld={() => {}} />)
    // the maze panel testids stay absent; the crux ones carry the crux prefix + the crux title
    expect(screen.queryByTestId('maze-training-panel')).not.toBeInTheDocument()
    const header = screen.getByTestId('crux-training-panel-header')
    expect(header).toBeInTheDocument()
    expect(screen.getByText('Training Crux')).toBeInTheDocument()
    expect(screen.getByText(`${CRUX_TRAINING_WORLDS.length} runs`)).toBeInTheDocument()
    await screen.findAllByText('6 chains')
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
    // the crux panel carries the same header health dot: Ø Best 43, Ø Worst 35 -> health 35/43
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
    render(<MazeTrainingDialog trainingSet={CRUX_TRAINING_SET} onPlayExampleWorld={onPlay} />)
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
        trainingSet={CRUX_TRAINING_SET}
        onPlayExampleWorld={() => {}}
        liveRun={{ worldId: 'crux_train_1', routeIndex: 2 }}
      />,
    )
    await screen.findAllByText('6 chains')
    await user.click(screen.getByTestId('crux-training-row-crux_train_1'))
    expect(screen.getByText('Live: 37 pts')).toBeInTheDocument()
    const overlay = screen.getByTestId('crux-training-live-vector-crux_train_1-2')
    expect(overlay.querySelectorAll('line')).toHaveLength(2)
    // only the focused chain gets the overlay
    expect(screen.queryByTestId('crux-training-live-vector-crux_train_1-0')).not.toBeInTheDocument()
  })
})

// --- the merged dialog: ONE panel with a tab bar over the three training sets (File → "Training…") -----------------

describe('MazeTrainingDialog (merged tabbed dialog)', () => {
  beforeEach(() => {
    stubLocalStorage()
    clearTransformerWatchEntries()
  })

  afterEach(() => {
    clearTransformerWatchEntries()
    setTransformerWatchEnabled(false)
    vi.unstubAllGlobals()
  })

  /** Wf meta fixture: 3 chains with per-chain tile pts + scores (the wf badge names chains + setup). */
  function makeWfMeta(id: string): WfTrainingMeta {
    const [, kind, n] = id.split('_')
    return {
      id,
      kind,
      setupKey: `${kind}:1001~a`,
      setupIndex: Number(n),
      name: `WF ${kind} ${n}`,
      candidate: { label: 'WF32 final (gen 1500)', gen: 1500 },
      bestScore: 120,
      chains: 3,
      tileSvg: {
        w: 206,
        h: 220,
        routes: Array.from({ length: 3 }, (_, i) => ({
          pts: TILE_PTS[0].map((p) => [...p] as [number, number]),
          score: 100 - i * 10,
        })),
      },
    }
  }

  /** Fetch stub serving the wf set's metas (candidates.json offline -> no chips, like an older deploy). */
  function stubFetchWithWfMeta(): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input)
        if (url.includes('policy-evolution/candidates.json')) throw new Error('offline')
        const match = url.match(/exampleWorlds\/([^/]+)\/meta\.json$/)
        const id = decodeURIComponent(match?.[1] ?? '')
        if (!WF_TRAINING_SET.worlds.some((s) => s.id === id)) throw new Error(`unexpected fetch: ${url}`)
        return { ok: true, json: async () => makeWfMeta(id) }
      }),
    )
  }

  it('renders the tab bar (Mazes / Crux / Widen-freeze); a tab click reports the set, the active one does not', async () => {
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, 5))
    const onSelect = vi.fn()
    render(
      <MazeTrainingDialog
        onPlayExampleWorld={() => {}}
        tabs={{ sets: trainingSetsOfCar('renn'), activeKey: 'maze', onSelect }}
      />,
    )
    const tabs = screen.getByTestId('training-tabs')
    expect(tabs.getAttribute('role')).toBe('tablist')
    expect(tabs.querySelectorAll('button')).toHaveLength(3)
    expect(screen.getByTestId('training-tab-maze')).toHaveTextContent('Mazes')
    expect(screen.getByTestId('training-tab-crux')).toHaveTextContent('Crux')
    expect(screen.getByTestId('training-tab-wf')).toHaveTextContent('Widen-freeze')
    expect(screen.getByTestId('training-tab-maze')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('training-tab-crux')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('training-tab-wf')).toHaveAttribute('aria-selected', 'false')
    await user.click(screen.getByTestId('training-tab-wf'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('wf')
    // clicking the already-active tab switches nothing (no redundant remount)
    await user.click(screen.getByTestId('training-tab-maze'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('renders the car switch (Renn / Schlau) in the header when given; a pick reports the car, the active one does not', async () => {
    const user = userEvent.setup()
    stubFetchWithMeta((spec) => makeMeta(spec, 5))
    const onSelectCar = vi.fn()
    render(
      <MazeTrainingDialog
        onPlayExampleWorld={() => {}}
        carSwitch={{ activeCar: 'renn', onSelectCar }}
      />,
    )
    // without the tabs prop there is no tab bar (the schlau car shows its single set without tabs)
    expect(screen.queryByTestId('training-tabs')).toBeNull()
    expect(screen.getByTestId('training-car-switch-renn')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('training-car-switch-schlau')).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByTestId('training-car-switch-schlau'))
    expect(onSelectCar).toHaveBeenCalledTimes(1)
    expect(onSelectCar).toHaveBeenCalledWith('schlau')
    // clicking the already-active car reports nothing
    await user.click(screen.getByTestId('training-car-switch-renn'))
    expect(onSelectCar).toHaveBeenCalledTimes(1)
  })

  it('regression: the wf training worlds ARE loadable inside the section (active tab, rows and tile plays)', async () => {
    const user = userEvent.setup()
    stubFetchWithWfMeta()
    const onPlay = vi.fn()
    // the Builder remounts the panel per tab (key={set}); the wf tab mounts the WF set with wf testids
    render(
      <MazeTrainingDialog
        trainingSet={WF_TRAINING_SET}
        tabs={{ sets: trainingSetsOfCar('renn'), activeKey: 'wf', onSelect: () => {} }}
        onPlayExampleWorld={onPlay}
      />,
    )
    expect(screen.getByTestId('training-tab-wf')).toHaveAttribute('aria-selected', 'true')
    for (const spec of WF_TRAINING_SET.worlds) {
      expect(screen.getByTestId(`wf-training-card-${spec.id}`)).toBeInTheDocument()
    }
    // a tile click loads the wf world into the builder (the Builder's handlePlayExampleWorld path)
    await user.click(screen.getByTestId('wf-training-row-wf_maze_1'))
    await user.click(screen.getByTestId('wf-training-route-tile-wf_maze_1-0'))
    expect(onPlay).toHaveBeenCalledWith('wf_maze_1', 0, null)
    // the row badge names the baked candidate's chain count + setup (the 3 maze-kind holdouts share the fixture setup key)
    expect(screen.getAllByText('3 chains · maze:1001~a')).toHaveLength(3)
  })

  it('keeps the candidate selection per set: the tabs render the same dropdown but read separate slots', async () => {
    const storage = stubLocalStorage()
    storage.set('mazeTrainingPanelCandidate', JSON.stringify('best'))
    stubFetchWithMeta((spec) => makeMeta(spec, 5), [makeCandidate('best', 'Best')])
    render(
      <MazeTrainingDialog
        onPlayExampleWorld={() => {}}
        tabs={{ sets: trainingSetsOfCar('renn'), activeKey: 'maze', onSelect: () => {} }}
      />,
    )
    await screen.findAllByText('Best: 5 pts')
    // the merged section restores the per-set candidate slot (no shared collapse slot anymore)
    expect(screen.getByTestId('maze-training-candidates')).toHaveTextContent('Best')
    expect(window.localStorage.getItem('trainingPanelCandidatesCollapsed')).toBeNull()
  })

  it('routeTileThumbHeightPx scales with the sidebar width (clamped at both ends)', () => {
    // sidebar defaults (300px wide section, full height): 4 tiles -> width-bound 65px
    expect(routeTileThumbHeightPx(300, 600, 4)).toBe(65)
    // narrowest sidebar (SIDEBAR_MIN_WIDTH 180px): the width share sinks below the clamp -> the 40px minimum
    expect(routeTileThumbHeightPx(180, 600, 4)).toBe(40)
    // a wide docked sidebar gives each tile more width -> larger thumbnails
    expect(routeTileThumbHeightPx(540, 600, 4)).toBe(134)
    // however wide, the thumbnails never exceed the 176px cap
    expect(routeTileThumbHeightPx(1200, 1200, 4)).toBe(176)
    // vertical scarcity also shrinks the thumbnails: a short section caps the height-bound share (below
    // the width share of the same width) and the 40px floor still catches extreme cases
    expect(routeTileThumbHeightPx(600, 350, 4)).toBe(77)
    expect(routeTileThumbHeightPx(600, 220, 4)).toBe(40)
  })
})
