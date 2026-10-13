import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { theme } from '@/config/theme'
import { useCornerBrResize } from '@/hooks/useCornerBrResize'
import { MAZE_TRAINING_SET, type TrainingMeta, type TrainingSet } from './trainingSets'
import {
  fetchMazeCandidates,
  type MazeCandidate,
  type MazeCandidatesFile,
} from '@/policyEvolution/mazeCandidates'
import {
  getTransformerWatchEntriesForEntity,
  subscribeTransformerWatch,
  type TransformerWatchEntry,
} from '@/runtime/transformerWatchBridge'

const BASE_URL = import.meta.env.BASE_URL || '/'

export interface MazeTrainingLiveRun {
  worldId: string
  routeIndex: number
}


export interface MazeTrainingDialogProps {
  isOpen: boolean
  onClose: () => void
  /** Which training set the panel serves (worlds, car ids, watch labels, tile texts); default: the training mazes. */
  trainingSet?: TrainingSet
  /**
   * Loads the example world into the builder focused on the selected route (Builder implements this; the dialog
   * stays open). `candidate` is the model selected via the header chips — the Builder swaps the drive-stage
   * weights of the loaded world to it (null = the deployed candidate baked into the export).
   */
  onPlayExampleWorld: (worldId: string, routeIndex: number, candidate: MazeCandidate | null) => void
  /** Training-maze world+route currently loaded and driving in the Builder (drives the live active-vector overlay and live score). */
  liveRun?: MazeTrainingLiveRun | null
}

interface MazeCardState {
  meta: TrainingMeta | null
  /** meta.json fetch failed (world not exported yet). */
  failed: boolean
}

const initialCardState: MazeCardState = { meta: null, failed: false }

/** Half-transparent panel fill over `theme.bg.panel` (#1b1f2a at ~0.55 alpha). */
const PANEL_BG_TRANSLUCENT = 'rgba(27, 31, 42, 0.55)'
/** Denser translucent strip for the header over the blurred scene. */
const HEADER_BG_TRANSLUCENT = theme.bg.modalGlassHeader

/** localStorage key suffixes per training set: `<set key>TrainingPanel<suffix>` (the two panels store independently). */
const PANEL_POS_KEY = 'TrainingPanelPos'
const PANEL_SIZE_KEY = 'TrainingPanelSize'
const PANEL_COLLAPSED_KEY = 'TrainingPanelCollapsed'
const PANEL_CANDIDATE_KEY = 'TrainingPanelCandidate'

const STRIP_HEIGHT = 38
const DEFAULT_WIDTH = 540
const DEFAULT_HEIGHT = 480
const MIN_WIDTH = 260
const MIN_HEIGHT = 120
/** Pointer travel (px) beyond which a header press counts as a drag, not a click. */
const DRAG_THRESHOLD_PX = 3

interface PanelPos {
  x: number
  y: number
}

interface PanelSize {
  width: number
  height: number
}

/** meta.json url of one training world (same layout for both sets: public/exampleWorlds/<id>/meta.json). */
function trainingMetaUrl(spec: { id: string }): string {
  return `${BASE_URL}exampleWorlds/${encodeURIComponent(spec.id)}/meta.json`
}

/** Per-tile image (clicking a tile in the expanded row starts the run on that way). */
function trainingTileUrl(spec: { id: string }, tileIndex: number): string {
  return `${BASE_URL}exampleWorlds/${encodeURIComponent(spec.id)}/route_${tileIndex}.svg`
}

function bestScoreLabel(meta: TrainingMeta): string {
  return meta.bestScore == null ? 'Best: —' : `Best: ${meta.bestScore} pts`
}

interface MazeLiveWatchState {
  score: number | null
  seg: number | null
}

const EMPTY_LIVE_WATCH: MazeLiveWatchState = { score: null, seg: null }

/** Parses the focused car's watch entries (score = "123 pts", seg = "3") into a stable live snapshot; labels are per training set. */
function parseLiveWatchEntries(entries: readonly TransformerWatchEntry[], watch: TrainingSet['watch']): MazeLiveWatchState {
  let score: number | null = null
  let seg: number | null = null
  for (const entry of entries) {
    if (entry.label === watch.score) {
      const match = /([\d.]+)/.exec(entry.value)
      if (match) score = Number(match[1])
    } else if (entry.label === watch.seg) {
      const parsed = Number(entry.value)
      if (Number.isFinite(parsed)) seg = parsed
    }
  }
  return { score, seg }
}

/** Route's own best headless score; "Score: —" when null or when the meta predates the tileSvg field. */
function routeScoreLabel(meta: TrainingMeta, routeIndex: number): string {
  const score = meta.tileSvg?.routes[routeIndex]?.score
  return score == null ? 'Score: —' : `Score: ${score} pts`
}

/**
 * Row-level weakest link: the WORST per-route score of the world — the minimum over the measured routes, i.e.
 * the way the candidate fails at (the v3 fitness ranks exactly this weakest link, so the row shows directly
 * where training is stuck). Includes the 1-based way number so the culprit route is visible without expanding
 * the row. Routes without a measured score (older exports) are ignored; no tileSvg / nothing measured -> null.
 */
function worstRouteScore(meta: TrainingMeta): { score: number; way: number } | null {
  const routes = meta.tileSvg?.routes
  if (!routes) return null
  let worst: { score: number; way: number } | null = null
  for (let i = 0; i < routes.length; i++) {
    const score = routes[i]?.score
    if (score == null) continue
    if (!worst || score < worst.score) worst = { score, way: i + 1 }
  }
  return worst
}

/** "Worst: 23 pts · way 2" / "Worst: 12 pts · chain 3"; "Worst: —" when no tile score is available. */
function worstScoreLabel(meta: TrainingMeta, noun: string): string {
  const worst = worstRouteScore(meta)
  return worst == null ? 'Worst: —' : `Worst: ${worst.score} pts · ${noun} ${worst.way}`
}

/**
 * Green→red hue mapper of every health dot: `worst ÷ best` (weakest link ÷ ceiling) with 1 = green (the stuck
 * routes score as well as the best), 0 = red (stuck at zero) and >1 clamping to green (the two sides count
 * different route sets). Gray while either side is unmeasured.
 */
function healthHueColor(best: number | null, worst: number | null): string {
  if (best == null || worst == null || best <= 0) return theme.text.muted
  const health = Math.max(0, Math.min(1, worst / best))
  return `hsl(${Math.round(health * 120)}, 75%, 45%)`
}

/**
 * Header health dot color: the weakest-link aggregate as one glance — Σ Worst ÷ Σ Best (ratio 1 = every run's
 * stuck route scores as well as its best = green, 0 = stuck at zero = red; >1 clamps to green since the sums
 * count different route sets). Gray while either side is unmeasured.
 */
function headerHealthColor(sumBest: number | null, sumWorst: number | null): string {
  return healthHueColor(sumBest, sumWorst)
}

/**
 * Row health dot color: the run's own weakest link — worst route score ÷ best score on the green→red hue
 * scale (1 = the stuck route scores as well as the run's best = green, 0 = stuck at zero = red). Gray while
 * either side is unmeasured.
 */
function rowHealthColor(meta: TrainingMeta): string {
  return healthHueColor(meta.bestScore, worstRouteScore(meta)?.score ?? null)
}

/** Min over the measured route scores of a candidate's per-world score snapshot; null when nothing is measured. */
function candidateWorstRoute(routes: Array<number | null>): number | null {
  const measured = routes.filter((s): s is number => s != null)
  return measured.length > 0 ? Math.min(...measured) : null
}

/**
 * Row health dot under the SELECTED candidate's headless scores — same weakest-link ratio as the deployed-side
 * `rowHealthColor`, but from the candidate's per-world snapshot. Gray when that world has no scores (older
 * deploy or a world the scoring pass did not cover).
 */
function candidateRowHealthColor(candidate: MazeCandidate, worldId: string): string {
  const s = candidate.scores?.[worldId]
  if (!s) return theme.text.muted
  return healthHueColor(s.best, candidateWorstRoute(s.routes))
}

/**
 * Live active-vector overlay for the focused route's thumbnail: the route's chain polyline dimmed, plus the
 * segment the run currently drives as a glowing halo+core stroke. Pure render of the parsed live watch state.
 */
function LiveRouteVectorOverlay({
  tileSvg,
  routeIndex,
  seg,
  testId,
}: {
  tileSvg: NonNullable<TrainingMeta['tileSvg']>
  routeIndex: number
  seg: number | null
  testId: string
}) {
  const route = tileSvg.routes[routeIndex]
  if (!route || route.pts.length < 2) return null
  const pts = route.pts
  const chainPoints = pts.map(([x, y]) => `${x},${y}`).join(' ')
  const segIndex = seg != null && Number.isFinite(seg) && seg >= 0 && seg + 1 < pts.length ? seg : null
  const from = segIndex != null ? pts[segIndex] : null
  const to = segIndex != null ? pts[segIndex + 1] : null
  return (
    <svg
      data-testid={testId}
      viewBox={`0 0 ${tileSvg.w} ${tileSvg.h}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <polyline
        points={chainPoints}
        fill="none"
        stroke={theme.text.muted}
        strokeWidth={1.5}
        opacity={0.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {from && to ? (
        <>
          <line
            x1={from[0]}
            y1={from[1]}
            x2={to[0]}
            y2={to[1]}
            stroke={theme.accent}
            strokeWidth={6}
            opacity={0.35}
            strokeLinecap="round"
          />
          <line
            x1={from[0]}
            y1={from[1]}
            x2={to[0]}
            y2={to[1]}
            stroke={theme.accent}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </>
      ) : null}
    </svg>
  )
}

function readStoredJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function persistJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota */
  }
}

function readStoredPos(key: string): PanelPos | null {
  const parsed = readStoredJson(key) as Partial<PanelPos> | null
  if (
    parsed &&
    typeof parsed.x === 'number' &&
    Number.isFinite(parsed.x) &&
    typeof parsed.y === 'number' &&
    Number.isFinite(parsed.y)
  ) {
    return { x: parsed.x, y: parsed.y }
  }
  return null
}

function readStoredSize(key: string): PanelSize | null {
  const parsed = readStoredJson(key) as Partial<PanelSize> | null
  if (
    parsed &&
    typeof parsed.width === 'number' &&
    Number.isFinite(parsed.width) &&
    parsed.width >= MIN_WIDTH &&
    typeof parsed.height === 'number' &&
    Number.isFinite(parsed.height) &&
    parsed.height >= MIN_HEIGHT
  ) {
    return { width: parsed.width, height: parsed.height }
  }
  return null
}

function readStoredCollapsed(key: string): boolean {
  return readStoredJson(key) !== false
}

function defaultPanelPos(width: number): PanelPos {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  const x = vw > 0 ? Math.max(16, vw - width - 24) : 16
  const y = vh > 0 ? Math.min(64, Math.max(0, vh - STRIP_HEIGHT - 16)) : 16
  return { x, y }
}

function clampPosToViewport(pos: PanelPos, panel: { width: number; height: number }): PanelPos {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  if (vw <= 0 || vh <= 0) return pos
  return {
    x: Math.min(Math.max(0, pos.x), Math.max(0, vw - panel.width)),
    y: Math.min(Math.max(0, pos.y), Math.max(0, vh - panel.height)),
  }
}

export default function MazeTrainingDialog({ isOpen, onClose, trainingSet = MAZE_TRAINING_SET, onPlayExampleWorld, liveRun = null }: MazeTrainingDialogProps) {
  // per-set localStorage slots (`mazeTrainingPanelPos` for the mazes, `cruxTrainingPanelPos` for the crux, ...)
  const posStorageKey = `${trainingSet.key}${PANEL_POS_KEY}`
  const sizeStorageKey = `${trainingSet.key}${PANEL_SIZE_KEY}`
  const collapsedStorageKey = `${trainingSet.key}${PANEL_COLLAPSED_KEY}`
  const candidateStorageKey = `${trainingSet.key}${PANEL_CANDIDATE_KEY}`
  const [cardStates, setCardStates] = useState<Record<string, MazeCardState>>(() =>
    Object.fromEntries(trainingSet.worlds.map((spec) => [spec.id, initialCardState])),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Run row whose full-width thumbnail is expanded (one at a time; null = all rows single-line). */
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  /** Route tile per world that started the run (the accent border marks the started way; default route 0). */
  const [selectedRoutes, setSelectedRoutes] = useState<Record<string, number>>({})
  const [collapsed, setCollapsed] = useState<boolean>(() => readStoredCollapsed(collapsedStorageKey))
  /** Candidate model selected via the header chips (null = the deployed candidate baked into the export); persisted. */
  const [candidateId, setCandidateId] = useState<string | null>(() => readStoredJson(candidateStorageKey) as string | null)
  const [candidatesFile, setCandidatesFile] = useState<MazeCandidatesFile | null>(null)
  const [size, setSize] = useState<PanelSize>(() => readStoredSize(sizeStorageKey) ?? { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
  const [pos, setPos] = useState<PanelPos>(() => {
    const stored = readStoredPos(posStorageKey)
    return stored ?? defaultPanelPos(readStoredSize(sizeStorageKey)?.width ?? DEFAULT_WIDTH)
  })

  const posRef = useRef(pos)
  posRef.current = pos
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number; moved: boolean } | null>(null)
  /** Set when a header drag ended so the trailing click does not toggle the panel. */
  const suppressClickRef = useRef(false)

  const expanded = !collapsed

  // Live watch of the focused route's car (the set's watch labels, published by the in-world score stage).
  // The snapshot must be referentially stable between publishes: the derived value is cached in a ref keyed by
  // the entity + the entries array identity (the bridge hands out a stable array between publishes).
  const liveCarId = liveRun != null ? trainingSet.carId(liveRun.routeIndex) : null
  const liveWatchRef = useRef<{ carId: string | null; entries: readonly TransformerWatchEntry[]; value: MazeLiveWatchState }>({
    carId: null,
    entries: [],
    value: EMPTY_LIVE_WATCH,
  })
  const getLiveWatchSnapshot = useCallback((): MazeLiveWatchState => {
    if (liveCarId == null) return EMPTY_LIVE_WATCH
    const entries = getTransformerWatchEntriesForEntity(liveCarId)
    const cached = liveWatchRef.current
    if (cached.carId === liveCarId && cached.entries === entries) return cached.value
    const value = parseLiveWatchEntries(entries, trainingSet.watch)
    liveWatchRef.current = { carId: liveCarId, entries, value }
    return value
  }, [liveCarId, trainingSet.watch])
  const liveWatch = useSyncExternalStore(subscribeTransformerWatch, getLiveWatchSnapshot)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    for (const spec of trainingSet.worlds) {
      fetch(trainingMetaUrl(spec), { cache: 'no-cache' })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status))
          return (await res.json()) as TrainingMeta
        })
        .then((meta) => {
          if (!cancelled) {
            setCardStates((prev) => ({ ...prev, [spec.id]: { meta, failed: false } }))
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCardStates((prev) => ({ ...prev, [spec.id]: { meta: null, failed: true } }))
          }
        })
    }
    return () => {
      cancelled = true
    }
  }, [isOpen, trainingSet.worlds])

  // Candidate models (island centers / best / shipped) exported next to the worlds; chips render only when the
  // file exists. A persisted selection that the file no longer lists is dropped (stale id after a re-export).
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    fetchMazeCandidates(BASE_URL).then((file) => {
      if (!cancelled) {
        setCandidatesFile(file)
        if (file) {
          setCandidateId((prev) => (prev && file.candidates.some((c) => c.id === prev) ? prev : null))
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  const selectedCandidate = useMemo(
    () => candidatesFile?.candidates.find((c) => c.id === candidateId) ?? null,
    [candidatesFile, candidateId],
  )

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      persistJson(collapsedStorageKey, next)
      return next
    })
  }, [collapsedStorageKey])

  const handleHeaderPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('button')) return
      e.preventDefault()
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: posRef.current.x,
        startPosY: posRef.current.y,
        moved: false,
      }
      e.currentTarget.setPointerCapture?.(e.pointerId)
    },
    [],
  )

  const handleHeaderPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) <= DRAG_THRESHOLD_PX) return
      drag.moved = true
      setPos(
        clampPosToViewport(
          { x: drag.startPosX + dx, y: drag.startPosY + dy },
          { width: size.width, height: expanded ? size.height : STRIP_HEIGHT },
        ),
      )
    },
    [expanded, size.width, size.height],
  )

  const handleHeaderPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null
      e.currentTarget.releasePointerCapture?.(e.pointerId)
      if (drag.moved) {
        suppressClickRef.current = true
        persistJson(posStorageKey, posRef.current)
      }
    },
    [posStorageKey],
  )

  const handleHeaderClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    toggleCollapsed()
  }, [toggleCollapsed])

  const handleHeaderKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggleCollapsed()
      }
    },
    [toggleCollapsed],
  )

  const resolveStartSize = useCallback(() => {
    const rect = panelRef.current?.getBoundingClientRect()
    return {
      width: rect?.width ?? size.width,
      height: rect?.height ?? size.height,
    }
  }, [size.width, size.height])

  const resizeHandleProps = useCornerBrResize({
    enabled: isOpen && expanded,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    size: { width: size.width, height: size.height },
    onSizeChange: (next) => {
      setSize(next)
      persistJson(sizeStorageKey, next)
    },
    resolveStartSize,
  })

  const handleCardClick = useCallback((id: string) => {
    setSelectedId(id)
    setExpandedRowId((prev) => (prev === id ? null : id))
  }, [])

  /** Clicking a route tile starts the run on that way (kept selected so the accent border marks the started way). */
  const handleTileClick = useCallback(
    (worldId: string, routeIndex: number) => {
      setSelectedId(worldId)
      setSelectedRoutes((prev) => ({ ...prev, [worldId]: routeIndex }))
      onPlayExampleWorld(worldId, routeIndex, selectedCandidate)
    },
    [onPlayExampleWorld, selectedCandidate],
  )

  /**
   * Chip click selects the candidate model (clicking the active chip again returns to the deployed candidate).
   * While a run is live, the chip re-loads that world+route with the new model right away; otherwise the
   * selection applies to the next tile click.
   */
  const handleCandidateChipClick = useCallback(
    (id: string) => {
      const next = selectedCandidate?.id === id ? null : id
      setCandidateId(next)
      persistJson(candidateStorageKey, next)
      const candidate = next ? candidatesFile?.candidates.find((c) => c.id === next) ?? null : null
      if (liveRun) onPlayExampleWorld(liveRun.worldId, liveRun.routeIndex, candidate)
    },
    [selectedCandidate, candidatesFile, liveRun, onPlayExampleWorld, candidateStorageKey],
  )

  const handleThumbError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = 'none'
  }, [])

  if (!isOpen) return null

  // header totals across the runs (weakest link at a glance): the SUM of every run's best score and the SUM of
  // every run's worst route score. Unmeasured values (null, not-yet-fetched) are skipped; nothing renders while
  // no meta has loaded at all. The worst sum is the dialog-side weakest-link aggregate: it only grows when the
  // stuck routes improve.
  const metas = trainingSet.worlds.map((spec) => cardStates[spec.id]?.meta).filter((m): m is TrainingMeta => m != null)
  const sumBest = metas.length && metas.some((m) => m.bestScore != null) ? metas.reduce((a, m) => a + (m.bestScore ?? 0), 0) : null
  const worsts = metas.map((m) => worstRouteScore(m)).filter((w): w is { score: number; way: number } => w != null)
  const sumWorst = worsts.length ? worsts.reduce((a, w) => a + w.score, 0) : null
  const totalsLine =
    sumBest != null || sumWorst != null
      ? `${sumBest != null ? `Σ Best: ${sumBest} pts` : 'Σ Best: —'} · ${sumWorst != null ? `Σ Worst: ${sumWorst} pts` : 'Σ Worst: —'}`
      : null

  // health-dot aggregates follow the SELECTED candidate when a chip is active (its headless per-world scores,
  // scored by export-maze-candidates.ts over this same training set); the numeric totals line keeps describing
  // the DEPLOYED candidate. Gray until the candidate's scores cover at least one world of this set.
  let dotSumBest: number | null = null
  let dotSumWorst: number | null = null
  if (selectedCandidate) {
    const entries = selectedCandidate.scores
      ? trainingSet.worlds.map((spec) => selectedCandidate.scores?.[spec.id]).filter((s): s is { best: number; routes: Array<number | null> } => s != null)
      : []
    dotSumBest = entries.length > 0 ? entries.reduce((a, s) => a + s.best, 0) : null
    const dotWorsts = entries.map((s) => candidateWorstRoute(s.routes)).filter((w): w is number => w != null)
    dotSumWorst = dotWorsts.length > 0 ? dotWorsts.reduce((a, w) => a + w, 0) : null
  } else {
    dotSumBest = sumBest
    dotSumWorst = sumWorst
  }
  const healthTitle = selectedCandidate
    ? `Weakest-link health of the SELECTED candidate (${selectedCandidate.label}${selectedCandidate.scoredGen != null ? ` · scored gen ${selectedCandidate.scoredGen}` : ''}): Σ worst ÷ Σ best of its headless scores — green = the stuck routes score as well as the best runs, red = stuck at zero, gray = not scored yet`
    : 'Weakest-link health of the deployed candidate: Σ Worst ÷ Σ Best — green = the stuck routes score as well as the best runs, red = stuck at zero, gray = not measured yet'

  const panelHeight = expanded ? size.height : STRIP_HEIGHT

  return createPortal(
    <div
      ref={panelRef}
      data-testid={`${trainingSet.testid}-training-panel`}
      role="dialog"
      aria-label={trainingSet.title}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: size.width,
        height: panelHeight,
        zIndex: theme.zIndex.popover,
        background: PANEL_BG_TRANSLUCENT,
        backdropFilter: 'blur(4px)',
        border: `1px solid ${theme.border.default}`,
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        pointerEvents: 'auto',
      }}
    >
      <div
        data-testid={`${trainingSet.testid}-training-panel-header`}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={trainingSet.title}
        title="Drag to move — click to expand/collapse"
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        onPointerCancel={handleHeaderPointerUp}
        onClick={handleHeaderClick}
        onKeyDown={handleHeaderKeyDown}
        style={{
          height: STRIP_HEIGHT,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 8px 0 10px',
          background: HEADER_BG_TRANSLUCENT,
          borderBottom: `1px solid ${theme.border.default}`,
          cursor: 'grab',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        <span
          aria-hidden={true}
          style={{
            color: theme.text.muted,
            fontSize: 11,
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        >
          &#9662;
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text.primary, whiteSpace: 'nowrap' }}>
          {trainingSet.title}
        </span>
        <span style={{ fontSize: 11, color: theme.text.muted, whiteSpace: 'nowrap' }}>
          {trainingSet.worlds.length} runs
        </span>
        {totalsLine ? (
          <>
            <span
              data-testid={`${trainingSet.testid}-training-header-health`}
              aria-hidden={true}
              title={healthTitle}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                flexShrink: 0,
                background: headerHealthColor(dotSumBest, dotSumWorst),
              }}
            />
            <span
              data-testid={`${trainingSet.testid}-training-header-totals`}
              title="Totals across the runs: sum of each run's best score and sum of its worst route score (the stuck routes)"
              style={{ fontSize: 11, color: theme.text.muted, whiteSpace: 'nowrap' }}
            >
              {totalsLine}
            </span>
          </>
        ) : null}
        {candidatesFile && candidatesFile.candidates.length > 0 ? (
          <span
            data-testid={`${trainingSet.testid}-training-candidates`}
            title="Candidate models: a chip swaps the driving net of the loaded world (the exported file keeps the deployed best). The scores in this dialog describe the DEPLOYED candidate — the deployed model is what the auto-trial baked into the export."
            style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
          >
            {candidatesFile.candidates.map((candidate) => {
              const active = selectedCandidate?.id === candidate.id
              return (
                <button
                  key={candidate.id}
                  type="button"
                  data-testid={`${trainingSet.testid}-training-candidate-chip-${candidate.id}`}
                  aria-pressed={active}
                  aria-label={`Candidate ${candidate.label}`}
                  title={`${candidate.detail}${candidate.gen != null ? ` · gen ${candidate.gen}` : ''}${candidate.scoredGen != null ? ` · scored gen ${candidate.scoredGen}` : ''}${active ? ' — click again for the deployed candidate' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCandidateChipClick(candidate.id)
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${active ? theme.accent : theme.border.default}`,
                    color: active ? theme.accent : theme.text.muted,
                    fontSize: 10,
                    lineHeight: 1,
                    padding: '3px 6px',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  {candidate.label}
                </button>
              )
            })}
          </span>
        ) : null}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          data-testid={`${trainingSet.testid}-training-close`}
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: theme.text.muted,
            fontSize: 18,
            lineHeight: 1,
            cursor: 'pointer',
            padding: 0,
            width: 22,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
          }}
          aria-label={`Close ${trainingSet.title}`}
        >
          ×
        </button>
      </div>

      {expanded ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {trainingSet.worlds.map((spec) => {
            const state = cardStates[spec.id] ?? initialCardState
            const meta = state.meta
            const exported = !state.failed && meta != null
            const selected = selectedId === spec.id
            const rowExpanded = expandedRowId === spec.id && exported
            return (
              <div
                key={spec.id}
                data-testid={`${trainingSet.testid}-training-card-${spec.id}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: rowExpanded ? 6 : 0,
                  background: theme.bg.section,
                  border: `1px solid ${selected ? theme.button.pickBorder : theme.border.default}`,
                  borderRadius: 8,
                }}
              >
                <div
                  data-testid={`${trainingSet.testid}-training-row-${spec.id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={spec.name}
                  aria-pressed={selected}
                  aria-expanded={rowExpanded}
                  onClick={() => handleCardClick(spec.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCardClick(spec.id)}
                  title={exported ? 'Click to show/hide the run thumbnail' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    aria-hidden={true}
                    style={{
                      color: theme.text.muted,
                      fontSize: 10,
                      transform: rowExpanded ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    &#9662;
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.text.primary, whiteSpace: 'nowrap' }}>
                    {spec.name}
                  </span>
                  <span style={{ fontSize: 11, color: theme.text.muted, whiteSpace: 'nowrap' }}>{spec.info}</span>
                  <div style={{ flex: 1 }} />
                  {exported && meta ? (
                    <>
                      <span
                        data-testid={`${trainingSet.testid}-training-row-health-${spec.id}`}
                        aria-hidden={true}
                        title={
                          selectedCandidate
                            ? `Weakest-link health of the SELECTED candidate (${selectedCandidate.label}): the run's worst route score ÷ its best under that model — green = the stuck route scores as well as the run's best, red = stuck at zero, gray = not scored yet`
                            : "Weakest-link health: the run's worst route score ÷ its best score — green = the stuck route scores as well as the run's best, red = stuck at zero, gray = not measured yet"
                        }
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: selectedCandidate ? candidateRowHealthColor(selectedCandidate, spec.id) : rowHealthColor(meta),
                        }}
                      />
                      <span style={{ fontSize: 11, color: theme.text.secondary, whiteSpace: 'nowrap' }}>
                        {bestScoreLabel(meta)}
                      </span>
                      <span style={{ fontSize: 11, color: theme.text.secondary, whiteSpace: 'nowrap' }}>
                        {worstScoreLabel(meta, trainingSet.noun)}
                      </span>
                      {trainingSet.badge(meta) ? (
                        <span style={{ fontSize: 11, color: theme.text.muted, whiteSpace: 'nowrap' }}>
                          {trainingSet.badge(meta)}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span style={{ fontSize: 11, color: theme.text.muted, whiteSpace: 'nowrap' }}>not exported yet</span>
                  )}
                </div>
                {rowExpanded && meta ? (
                  <div style={{ padding: '0 8px 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                      {Array.from({ length: trainingSet.tileCount(meta) }, (_, i) => {
                        const tile = trainingSet.tileText(meta, i)
                        const tileSelected = (selectedRoutes[spec.id] ?? 0) === i
                        const isLiveTile = liveRun != null && liveRun.worldId === spec.id && liveRun.routeIndex === i
                        return (
                          <div
                            key={i}
                            data-testid={`${trainingSet.testid}-training-route-tile-${spec.id}-${i}`}
                            role="button"
                            tabIndex={0}
                            aria-pressed={tileSelected}
                            aria-label={`${spec.name} ${tile.name.toLowerCase()} (${tile.long})`}
                            title={`${tile.name} (${tile.long}) — start the run on this ${trainingSet.noun}`}
                            onClick={() => handleTileClick(spec.id, i)}
                            onKeyDown={(e) => e.key === 'Enter' && handleTileClick(spec.id, i)}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: 3,
                              background: theme.bg.surface,
                              border: `2px solid ${tileSelected ? theme.accent : theme.border.default}`,
                              borderRadius: 6,
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 3,
                            }}
                          >
                            <div style={{ position: 'relative', width: '100%', height: '8.4em' }}>
                              <img
                                data-testid={`${trainingSet.testid}-training-thumb-${spec.id}-${i}`}
                                src={trainingTileUrl(spec, i)}
                                alt={`${spec.name} ${tile.name.toLowerCase()} (${tile.long}) thumbnail (all guidance vectors)`}
                                style={{ width: '100%', height: '8.4em', display: 'block', objectFit: 'contain', borderRadius: 4 }}
                                onError={handleThumbError}
                              />
                              {isLiveTile && meta.tileSvg ? (
                                <LiveRouteVectorOverlay
                                  tileSvg={meta.tileSvg}
                                  routeIndex={i}
                                  seg={liveWatch.seg}
                                  testId={`${trainingSet.testid}-training-live-vector-${spec.id}-${i}`}
                                />
                              ) : null}
                            </div>
                            <span
                              style={{
                                fontSize: 10,
                                color: tileSelected ? theme.accent : theme.text.muted,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {tileSelected ? '\u25B8 ' : ''}{tile.name} {tile.short}
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                color: theme.text.muted,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {routeScoreLabel(meta, i)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 11, color: theme.text.secondary }}>{meta.candidate.label}</span>
                      {liveRun != null && liveRun.worldId === spec.id ? (
                        <span style={{ fontSize: 11, color: theme.accent, fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {liveWatch.score == null ? 'Live: -' : `Live: ${liveWatch.score} pts`}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}

      {expanded ? (
        <div
          aria-hidden={true}
          {...resizeHandleProps}
          data-testid={`${trainingSet.testid}-training-resize-handle`}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 16,
            height: 16,
            cursor: 'nwse-resize',
            touchAction: 'none',
          }}
        />
      ) : null}
    </div>,
    document.body,
  )
}
