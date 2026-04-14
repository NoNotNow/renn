import { useEffect, useRef, useState, useCallback } from 'react'
import type { CSSProperties } from 'react'
import type { SceneFrameTiming } from '@/runtime/frameTiming'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'

/** Limit React setState rate when overlay is on (Tier 3 — `performance-work.md` §11). */
const FRAME_STATS_UI_MIN_INTERVAL_MS = 100

const DEFAULT_POS = { left: 8, top: 8 }

const PANEL_BASE: CSSProperties = {
  position: 'absolute',
  zIndex: 150,
  pointerEvents: 'auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 11,
  lineHeight: 1.35,
  color: '#e6e9f2',
  textShadow: '0 1px 2px rgba(0,0,0,0.85)',
  background: 'rgba(13,15,20,0.72)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  padding: '8px 10px',
  minWidth: 200,
}

function normalizePos(raw: unknown): { left: number; top: number } {
  if (raw == null || typeof raw !== 'object') return { ...DEFAULT_POS }
  const o = raw as { left?: unknown; top?: unknown }
  const left = typeof o.left === 'number' && Number.isFinite(o.left) ? o.left : DEFAULT_POS.left
  const top = typeof o.top === 'number' && Number.isFinite(o.top) ? o.top : DEFAULT_POS.top
  return { left, top }
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  return ms < 10 ? ms.toFixed(2) : ms.toFixed(1)
}

/**
 * Dev overlay: last-frame ms breakdown from `runSceneFrame` (Builder / optional SceneView).
 */
export function FrameStatsOverlay({
  frameTimingRef,
  onClose,
}: {
  frameTimingRef: React.MutableRefObject<SceneFrameTiming | null>
  onClose: () => void
}) {
  const [pos, setPos] = useLocalStorageState<{ left: number; top: number }>(
    'builderFrameStatsOverlayPos',
    DEFAULT_POS,
  )
  const safePos = normalizePos(pos)

  const [snapshot, setSnapshot] = useState<SceneFrameTiming | null>(null)
  const fpsEmaRef = useRef(60)
  const lastUiPushRef = useRef(0)

  const dragRef = useRef<{
    originX: number
    originY: number
    startLeft: number
    startTop: number
  } | null>(null)

  const onDragPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.originX
      const dy = e.clientY - d.originY
      setPos({ left: d.startLeft + dx, top: d.startTop + dy })
    },
    [setPos],
  )

  const endDrag = useCallback(() => {
    dragRef.current = null
    window.removeEventListener('pointermove', onDragPointerMove)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)
  }, [onDragPointerMove])

  const onDragHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      dragRef.current = {
        originX: e.clientX,
        originY: e.clientY,
        startLeft: safePos.left,
        startTop: safePos.top,
      }
      window.addEventListener('pointermove', onDragPointerMove)
      window.addEventListener('pointerup', endDrag)
      window.addEventListener('pointercancel', endDrag)
    },
    [endDrag, onDragPointerMove, safePos.left, safePos.top],
  )

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onDragPointerMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [endDrag, onDragPointerMove])

  useEffect(() => {
    let id: number
    const tick = (): void => {
      id = requestAnimationFrame(tick)
      const s = frameTimingRef.current
      if (!s) return
      const instFps = 1000 / s.frameMs
      fpsEmaRef.current = fpsEmaRef.current * 0.85 + instFps * 0.15
      const now = performance.now()
      if (now - lastUiPushRef.current >= FRAME_STATS_UI_MIN_INTERVAL_MS) {
        lastUiPushRef.current = now
        setSnapshot({ ...s })
      }
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [frameTimingRef])

  if (!snapshot) return null

  const fps = fpsEmaRef.current
  const s = snapshot
  const rows: [string, number][] = [
    ['transformers', s.transformersMs],
    ['physics', s.physicsMs],
    ['script Δcollision', s.scriptCollisionsMs],
    ['script onUpdate', s.scriptsOnUpdateMs],
    ['camera', s.cameraMs],
    ['game HUD', s.hudMs],
    ['render', s.renderMs],
  ]

  const panelStyle: CSSProperties = {
    ...PANEL_BASE,
    left: safePos.left,
    top: safePos.top,
  }

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 6,
    userSelect: 'none',
  }

  const dragHandleStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    cursor: 'grab',
    fontWeight: 600,
    color: '#a8b4c8',
    touchAction: 'none',
  }

  const closeBtnStyle: CSSProperties = {
    flex: '0 0 auto',
    margin: '-4px -4px -4px 0',
    padding: '2px 6px',
    lineHeight: 1,
    fontSize: 16,
    color: '#c4cdd8',
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  }

  return (
    <div style={panelStyle} role="region" aria-label="Frame timing statistics">
      <div style={headerStyle}>
        <div
          style={dragHandleStyle}
          onPointerDown={onDragHandlePointerDown}
          title="Ziehen zum Verschieben"
        >
          Frame {formatMs(s.frameMs)} ms · ~{fps.toFixed(0)} fps
        </div>
        <button
          type="button"
          aria-label="Frame stats schließen"
          style={closeBtnStyle}
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
        >
          ×
        </button>
      </div>
      {rows.map(([label, ms]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: '#8b98a8' }}>{label}</span>
          <span>{formatMs(ms)} ms</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
        <span style={{ color: '#8b98a8' }}>GPU draw calls</span>
        <span>{s.renderCalls}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ color: '#8b98a8' }}>GPU triangles</span>
        <span>{s.renderTriangles.toLocaleString()}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ color: '#8b98a8' }}>geometries</span>
        <span>{s.geometries}</span>
      </div>
    </div>
  )
}
