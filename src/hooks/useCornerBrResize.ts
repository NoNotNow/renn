import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'

export interface CornerBrSize {
  width: number
  height: number
}

export interface UseCornerBrResizeOptions {
  enabled: boolean
  minWidth: number
  minHeight: number
  size: CornerBrSize
  onSizeChange: (next: CornerBrSize) => void
  /** When set, used on pointer down instead of `size` (e.g. measured DOM rect). */
  resolveStartSize?: () => CornerBrSize
}

/** Shared bottom-right corner resize (Modal, Texture Maker floating window). */
export function useCornerBrResize({
  enabled,
  minWidth,
  minHeight,
  size,
  onSizeChange,
  resolveStartSize,
}: UseCornerBrResizeOptions) {
  const resizeDragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return
      e.preventDefault()
      e.stopPropagation()
      const start = resolveStartSize?.() ?? size
      resizeDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: start.width,
        startH: start.height,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [enabled, resolveStartSize, size],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const drag = resizeDragRef.current
      if (!drag) return
      const nextW = Math.max(minWidth, drag.startW + (e.clientX - drag.startX))
      const nextH = Math.max(minHeight, drag.startH + (e.clientY - drag.startY))
      onSizeChange({ width: nextW, height: nextH })
    },
    [minHeight, minWidth, onSizeChange],
  )

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!resizeDragRef.current) return
    resizeDragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  }
}
