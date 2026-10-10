import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { theme } from '@/config/theme'
import { secondaryButtonStyle, secondaryButtonStyleDisabled } from './sharedStyles'
import { useCornerBrResize } from '@/hooks/useCornerBrResize'
import {
  MAZE_TRAINING_WORLDS,
  type MazeTrainingMeta,
  type MazeTrainingWorldSpec,
} from '@/policyEvolution/mazeTraining'

const BASE_URL = import.meta.env.BASE_URL || '/'

export interface MazeTrainingDialogProps {
  isOpen: boolean
  onClose: () => void
  /** Loads the example world into the builder focused on the selected route (Builder implements this; the dialog stays open). */
  onPlayExampleWorld: (worldId: string, routeIndex: number) => void
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

/** Per-route tile image (individually clickable in the expanded row = the run's target vector). */
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

export default function MazeTrainingDialog({ isOpen, onClose, onPlayExampleWorld }: MazeTrainingDialogProps) {
  const [cardStates, setCardStates] = useState<Record<string, MazeCardState>>(() =>
    Object.fromEntries(MAZE_TRAINING_WORLDS.map((spec) => [spec.id, initialCardState])),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Run row whose full-width thumbnail is expanded (one at a time; null = all rows single-line). */
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  /** Selected route tile per world (the run's target vector; default route 0). */
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

  const handlePlay = useCallback(
    (id: string) => {
      setSelectedId(id)
      onPlayExampleWorld(id, selectedRoutes[id] ?? 0)
    },
    [onPlayExampleWorld, selectedRoutes],
  )

  const handleTileClick = useCallback((worldId: string, routeIndex: number) => {
    setSelectedRoutes((prev) => ({ ...prev, [worldId]: routeIndex }))
  }, [])

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
                  <button
                    type="button"
                    data-testid={`maze-training-play-${spec.id}`}
                    disabled={!exported}
                    onClick={(e) => {
                      e.stopPropagation()
                      handlePlay(spec.id)
                    }}
                    style={{
                      ...secondaryButtonStyle,
                      ...(exported ? {} : secondaryButtonStyleDisabled),
                      ...(exported && selected ? { background: theme.button.pick } : {}),
                      padding: '3px 10px',
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Play
                  </button>
                </div>
                {rowExpanded && meta ? (
                  <div style={{ padding: '0 8px 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                      {Array.from({ length: (meta.routes?.forward ?? 0) + (meta.routes?.reversed ?? 0) }, (_, i) => {
                        const reversed = i >= (meta.routes?.forward ?? 0)
                        const tileSelected = (selectedRoutes[spec.id] ?? 0) === i
                        return (
                          <div
                            key={i}
                            data-testid={`maze-training-route-tile-${spec.id}-${i}`}
                            role="button"
                            tabIndex={0}
                            aria-pressed={tileSelected}
                            aria-label={`${spec.name} way ${i + 1} (${reversed ? 'reversed' : 'forward'})`}
                            title={`Way ${i + 1} (${reversed ? 'reversed' : 'forward'}) — select as the run's target vector`}
                            onClick={() => handleTileClick(spec.id, i)}
                            onKeyDown={(e) => e.key === 'Enter' && handleTileClick(spec.id, i)}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: 3,
                              background: tileSelected ? theme.booster.tileSelectBg : theme.bg.surface,
                              border: `2px solid ${tileSelected ? theme.accent : theme.border.default}`,
                              borderRadius: 6,
                              boxShadow: tileSelected
                                ? '0 0 0 1px rgba(138, 180, 255, 0.45), 0 0 14px rgba(138, 180, 255, 0.35)'
                                : 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 3,
                            }}
                          >
                            <div style={{ position: 'relative', width: '100%' }}>
                              <img
                                data-testid={`maze-training-thumb-${spec.id}-${i}`}
                                src={mazeRouteTileUrl(spec, i)}
                                alt={`${spec.name} way ${i + 1} (${reversed ? 'reversed' : 'forward'}) thumbnail (all guidance vectors)`}
                                style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain', borderRadius: 4 }}
                                onError={handleThumbError}
                              />
                              {tileSelected ? (
                                <span
                                  data-testid={`maze-training-active-vector-${spec.id}`}
                                  style={{
                                    position: 'absolute',
                                    top: 3,
                                    left: 3,
                                    fontSize: 10,
                                    lineHeight: 1.4,
                                    padding: '1px 5px',
                                    background: 'rgba(17, 20, 28, 0.85)',
                                    border: `1px solid ${theme.accent}`,
                                    borderRadius: 4,
                                    color: theme.accent,
                                    whiteSpace: 'nowrap',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  {`Active \u00B7 Way ${i + 1} \u00B7 ${reversed ? 'rev' : 'fwd'}`}
                                </span>
                              ) : null}
                            </div>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: tileSelected ? 700 : 400,
                                color: tileSelected ? theme.accent : theme.text.muted,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {tileSelected ? '\u25B8 ' : ''}Way {i + 1} {reversed ? '(rev)' : '(fwd)'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <span style={{ fontSize: 11, color: theme.text.secondary }}>{meta.candidate.label}</span>
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
