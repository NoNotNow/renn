import { useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { computeDrawerResizeNext, type DrawerResizeEdge } from '@/components/workspace/floatingDrawerLayout'

export interface PanelEdgeResizeState {
  pos: { x: number; y: number }
  size: { width: number; height: number }
}

export interface UsePanelEdgeResizeOptions {
  enabled: boolean
  minWidth: number
  minHeight: number
  /** Fallback start pos+size when the panel cannot be measured on pointer down (tests). */
  start: PanelEdgeResizeState
  /** Next (already viewport-clamped) pos+size on every drag move. */
  onChange: (next: PanelEdgeResizeState) => void
  /** Viewport bounds for clamping; defaults to `window.innerWidth/innerHeight`. */
  viewport?: () => { width: number; height: number }
  /** Measured panel rect on pointer down (jsdom returns null -> falls back to `start`). */
  resolveStart?: () => PanelEdgeResizeState | null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * All-edges + corners resize for viewport-fixed floating panels (position: fixed, px pos/size).
 * Reuses the shared `computeDrawerResizeNext` math and clamps every drag so the panel never
 * leaves the viewport. Left/top drags move the panel's position together with its size.
 */
export function usePanelEdgeResize({
  enabled,
  minWidth,
  minHeight,
  start,
  onChange,
  viewport,
  resolveStart,
}: UsePanelEdgeResizeOptions) {
  const resizeRef = useRef<{ startX: number; startY: number; startPos: PanelEdgeResizeState } | null>(null)

  const resolveViewport = useCallback((): { width: number; height: number } => {
    if (viewport) return viewport()
    return { width: window.innerWidth, height: window.innerHeight }
  }, [viewport])

  const onResizeMouseDown = useCallback(
    (edge: DrawerResizeEdge) => (e: ReactMouseEvent) => {
      if (!enabled) return
      e.preventDefault()
      e.stopPropagation()
      const startPos = resolveStart?.() ?? start
      resizeRef.current = { startX: e.clientX, startY: e.clientY, startPos }
      const vp = resolveViewport()

      const onMove = (move: MouseEvent) => {
        const drag = resizeRef.current
        if (!drag) return
        const next = computeDrawerResizeNext({
          edge,
          dx: move.clientX - drag.startX,
          dy: move.clientY - drag.startY,
          startWidth: drag.startPos.size.width,
          startHeight: drag.startPos.size.height,
          startPosX: drag.startPos.pos.x,
          startPosY: drag.startPos.pos.y,
          minWidth,
          minHeight,
          maxWidth: Math.max(minWidth, vp.width),
          maxHeight: Math.max(minHeight, vp.height),
        })
        // keep the panel inside the viewport no matter which edge was dragged
        const nextPos = {
          x: clamp(next.posX ?? drag.startPos.pos.x, 0, Math.max(0, vp.width - next.width)),
          y: clamp(next.posY ?? drag.startPos.pos.y, 0, Math.max(0, vp.height - next.height)),
        }
        onChange({ pos: nextPos, size: { width: next.width, height: next.height } })
      }
      const onUp = () => {
        resizeRef.current = null
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [enabled, minHeight, minWidth, onChange, resolveStart, resolveViewport, start],
  )

  return onResizeMouseDown
}
