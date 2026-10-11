import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { theme } from '@/config/theme'
import { useCornerBrResize } from '@/hooks/useCornerBrResize'
import {
  MAZE_TRAINING_WORLDS,
  mazeCarId,
  type MazeTrainingMeta,
  type MazeTrainingWorldSpec,
} from '@/policyEvolution/mazeTraining'
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
  /** Loads the example world into the builder focused on the selected route (Builder implements this; the dialog stays open). */
  onPlayExampleWorld: (worldId: string, routeIndex: number) => void
  /** Training-maze world+route currently loaded and driving in the Builder (drives the live active-vector overlay and live score). */
  liveRun?: MazeTrainingLiveRun | null
}

interface MazeCardState {
  meta: MazeTrainingMeta | null
  /** meta.json fetch failed (world not exported yet). */
  failed: boolean
}

const initialCardState: MazeCardState = { meta: null, failed: false }

/** Half-transparent panel fill over `theme.bg.panel` (#1b1f2a at ~0.55 alpha). */
const PANEL_BG_TRANSLUCENT = 'rgba(27, 31, 42, 0.55)'
/** Denser translucent strip for the header over the blurred scene. */
const HEADER_BG_TRANSLUCENT = theme.bg.modalGlassHeader

const POS_STORAGE_KEY = 'mazeTrainingPanelPos'
const SIZE_STORAGE_KEY = 'mazeTrainingPanelSize'
const COLLAPSED_STORAGE_KEY = 'mazeTrainingPanelCollapsed'

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

function mazeMetaUrl(spec: MazeTrainingWorldSpec): string {
  return `${BASE_URL}exampleWorlds/${encodeURIComponent(spec.id)}/meta.json`
}

/** Per-route tile image (clicking a tile in the expanded row starts the run on that way). */
function mazeRouteTileUrl(spec: MazeTrainingWorldSpec, routeIndex: number): string {
  return `${BASE_URL}exampleWorlds/${encodeURIComponent(spec.id)}/route_${routeIndex}.svg`
}

/** "3 ways · 1 reversed"; null when an older meta.json predates the routes field. */
function routesLabel(meta: MazeTrainingMeta): string | null {
  const routes = meta.routes
  if (!routes || typeof routes.forward !== 'number') return null
  const reversed = typeof routes.reversed === 'number' ? routes.reversed : 0
  return `${routes.forward} ways · ${reversed} reversed`
}

function bestScoreLabel(meta: MazeTrainingMeta): string {
  return meta.bestScore == null ? 'Best: —' : `Best: ${meta.bestScore} pts`
}

interface MazeLiveWatchState {
  score: number | null
  seg: number | null
}

const EMPTY_LIVE_WATCH: MazeLiveWatchState = { score: null, seg: null }

/** Parses the focused car's watch entries ('maze.score' = "123 pts", 'maze.seg' = "3") into a stable live snapshot. */
function parseLiveWatchEntries(entries: readonly TransformerWatchEntry[]): MazeLiveWatchState {
  let score: number | null = null
  let seg: number | null = null
  for (const entry of entries) {
    if (entry.label === 'maze.score') {
      const match = /(\d+)/.exec(entry.value)
      if (match) score = Number(match[1])
    } else if (entry.label === 'maze.seg') {
      const parsed = Number(entry.value)
      if (Number.isFinite(parsed)) seg = parsed
    }
  }
  return { score, seg }
}

/** Route's own best headless score; "Score: —" when null or when the meta predates the tileSvg field. */
function routeScoreLabel(meta: MazeTrainingMeta, routeIndex: number): string {
  const score = meta.tileSvg?.routes[routeIndex]?.score
  return score == null ? 'Score: —' : `Score: ${score} pts`
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
  tileSvg: NonNullable<MazeTrainingMeta['tileSvg']>
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

function readStoredPos(): PanelPos | null {
  const parsed = readStoredJson(POS_STORAGE_KEY) as Partial<PanelPos> | null
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

function readStoredSize(): PanelSize | null {
  const parsed = readStoredJson(SIZE_STORAGE_KEY) as Partial<PanelSize> | null
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

function readStoredCollapsed(): boolean {
  return readStoredJson(COLLAPSED_STORAGE_KEY) !== false
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

export default function MazeTrainingDialog({ isOpen, onClose, onPlayExampleWorld, liveRun = null }: MazeTrainingDialogProps) {
  const [cardStates, setCardStates] = useState<Record<string, MazeCardState>>(() =>
    Object.fromEntries(MAZE_TRAINING_WORLDS.map((spec) => [spec.id, initialCardState])),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Run row whose full-width thumbnail is expanded (one at a time; null = all rows single-line). */
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  /** Route tile per world that started the run (the accent border marks the started way; default route 0). */
  const [selectedRoutes, setSelectedRoutes] = useState<Record<string, number>>({})
  const [collapsed, setCollapsed] = useState<boolean>(() => readStoredCollapsed())
  const [size, setSize] = useState<PanelSize>(() => readStoredSize() ?? { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
  const [pos, setPos] = useState<PanelPos>(() => {
    const stored = readStoredPos()
    return stored ?? defaultPanelPos(readStoredSize()?.width ?? DEFAULT_WIDTH)
  })

  const posRef = useRef(pos)
  posRef.current = pos
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number; moved: boolean } | null>(null)
  /** Set when a header drag ended so the trailing click does not toggle the panel. */
  const suppressClickRef = useRef(false)

  const expanded = !collapsed

  // Live watch of the focused route's car ('maze.score' / 'maze.seg' published by the in-world score stage).
  // The snapshot must be referentially stable between publishes: the derived value is cached in a ref keyed by
  // the entity + the entries array identity (the bridge hands out a stable array between publishes).
  const liveCarId = liveRun != null ? mazeCarId(liveRun.routeIndex) : null
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
    const value = parseLiveWatchEntries(entries)
    liveWatchRef.current = { carId: liveCarId, entries, value }
    return value
  }, [liveCarId])
  const liveWatch = useSyncExternalStore(subscribeTransformerWatch, getLiveWatchSnapshot)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    for (const spec of MAZE_TRAINING_WORLDS) {
      fetch(mazeMetaUrl(spec), { cache: 'no-cache' })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status))
          return (await res.json()) as MazeTrainingMeta
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
  }, [isOpen])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      persistJson(COLLAPSED_STORAGE_KEY, next)
      return next
    })
  }, [])

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
        persistJson(POS_STORAGE_KEY, posRef.current)
      }
    },
    [],
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
      persistJson(SIZE_STORAGE_KEY, next)
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
      onPlayExampleWorld(worldId, routeIndex)
    },
    [onPlayExampleWorld],
  )

  const handleThumbError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = 'none'
  }, [])

  if (!isOpen) return null

  const panelHeight = expanded ? size.height : STRIP_HEIGHT

  return createPortal(
    <div
      ref={panelRef}
      data-testid="maze-training-panel"
      role="dialog"
      aria-label="Training Mazes"
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
        data-testid="maze-training-panel-header"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label="Training Mazes"
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
          Training Mazes
        </span>
        <span style={{ fontSize: 11, color: theme.text.muted, whiteSpace: 'nowrap' }}>
          {MAZE_TRAINING_WORLDS.length} runs
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          data-testid="maze-training-close"
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
          aria-label="Close Training Mazes"
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
          {MAZE_TRAINING_WORLDS.map((spec) => {
            const state = cardStates[spec.id] ?? initialCardState
            const meta = state.meta
            const exported = !state.failed && meta != null
            const selected = selectedId === spec.id
            const rowExpanded = expandedRowId === spec.id && exported
            return (
              <div
                key={spec.id}
                data-testid={`maze-training-card-${spec.id}`}
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
                  data-testid={`maze-training-row-${spec.id}`}
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
                  <span style={{ fontSize: 11, color: theme.text.muted, whiteSpace: 'nowrap' }}>seed {spec.seed}</span>
                  <div style={{ flex: 1 }} />
                  {exported && meta ? (
                    <>
                      <span style={{ fontSize: 11, color: theme.text.secondary, whiteSpace: 'nowrap' }}>
                        {bestScoreLabel(meta)}
                      </span>
                      {routesLabel(meta) ? (
                        <span style={{ fontSize: 11, color: theme.text.muted, whiteSpace: 'nowrap' }}>
                          {routesLabel(meta)}
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
                      {Array.from({ length: (meta.routes?.forward ?? 0) + (meta.routes?.reversed ?? 0) }, (_, i) => {
                        const reversed = i >= (meta.routes?.forward ?? 0)
                        const tileSelected = (selectedRoutes[spec.id] ?? 0) === i
                        const isLiveTile = liveRun != null && liveRun.worldId === spec.id && liveRun.routeIndex === i
                        return (
                          <div
                            key={i}
                            data-testid={`maze-training-route-tile-${spec.id}-${i}`}
                            role="button"
                            tabIndex={0}
                            aria-pressed={tileSelected}
                            aria-label={`${spec.name} way ${i + 1} (${reversed ? 'reversed' : 'forward'})`}
                            title={`Way ${i + 1} (${reversed ? 'reversed' : 'forward'}) — start the run on this way`}
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
                                data-testid={`maze-training-thumb-${spec.id}-${i}`}
                                src={mazeRouteTileUrl(spec, i)}
                                alt={`${spec.name} way ${i + 1} (${reversed ? 'reversed' : 'forward'}) thumbnail (all guidance vectors)`}
                                style={{ width: '100%', height: '8.4em', display: 'block', objectFit: 'contain', borderRadius: 4 }}
                                onError={handleThumbError}
                              />
                              {isLiveTile && meta.tileSvg ? (
                                <LiveRouteVectorOverlay
                                  tileSvg={meta.tileSvg}
                                  routeIndex={i}
                                  seg={liveWatch.seg}
                                  testId={`maze-training-live-vector-${spec.id}-${i}`}
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
                              {tileSelected ? '\u25B8 ' : ''}Way {i + 1} {reversed ? '(rev)' : '(fwd)'}
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
          data-testid="maze-training-resize-handle"
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
