import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SceneFrameTiming } from '@/runtime/frameTiming'

/** Limit React setState rate when overlay is on (Tier 3 — `performance-work.md` §11). */
const FRAME_STATS_UI_MIN_INTERVAL_MS = 100

const PANEL_STYLE: CSSProperties = {
  position: 'absolute',
  left: 8,
  top: 8,
  zIndex: 150,
  pointerEvents: 'none',
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

function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  return ms < 10 ? ms.toFixed(2) : ms.toFixed(1)
}

/**
 * Dev overlay: last-frame ms breakdown from `runSceneFrame` (Builder / optional SceneView).
 */
export function FrameStatsOverlay({
  frameTimingRef,
}: {
  frameTimingRef: React.MutableRefObject<SceneFrameTiming | null>
}) {
  const [snapshot, setSnapshot] = useState<SceneFrameTiming | null>(null)
  const fpsEmaRef = useRef(60)
  const lastUiPushRef = useRef(0)

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

  return (
    <div style={PANEL_STYLE} aria-hidden>
      <div style={{ marginBottom: 6, fontWeight: 600, color: '#a8b4c8' }}>
        Frame {formatMs(s.frameMs)} ms · ~{fps.toFixed(0)} fps
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
