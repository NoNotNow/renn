import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'

export interface PointerDragDelta {
  pointerId: number
  /** Total px moved since the drag started (drag start = primary pointerdown position). */
  dx: number
  dy: number
}

export interface UsePointerDragOptions {
  /**
   * Runs on primary pointerdown before the drag begins; return `false` to veto it
   * (e.g. pointerdown on an inner button). Snapshot any start state here.
   */
  onStart?: (e: ReactPointerEvent<HTMLElement>) => boolean | void
  onMove: (delta: PointerDragDelta) => void
  /** Fires once on pointerup (`cancelled: false`) or pointercancel (`cancelled: true`). */
  onEnd: (e: { cancelled: boolean; pointerId: number }) => void
}

/**
 * Shared pointer-drag capture for move/resize handles (mouse + touch + pen).
 * Handlers attach to the handle element; `setPointerCapture` keeps fast drags that
 * leave the element delivering move/up/cancel to the same element. Deltas are total
 * pixels from the drag start, matching the previous document-mousemove implementations.
 * Touch support is additive: mouse pointer events drive the same callbacks.
 *
 * `onLostPointerCapture` ends the drag as cancelled when capture is lost without a
 * pointerup/pointercancel (element removed mid-drag, browser edge cases). It is
 * idempotent: a lost-capture after a normal up/cancel is a no-op.
 */
export function usePointerDrag({ onStart, onMove, onEnd }: UsePointerDragOptions) {
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null)
  const cbsRef = useRef({ onStart, onMove, onEnd })
  cbsRef.current = { onStart, onMove, onEnd }

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>): void => {
    if (e.button !== 0) return
    if (cbsRef.current.onStart?.(e) === false) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* pointer capture unavailable */
    }
  }, [])

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>): void => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    cbsRef.current.onMove({
      pointerId: e.pointerId,
      dx: e.clientX - d.startX,
      dy: e.clientY - d.startY,
    })
  }, [])

  const endDrag = useCallback((e: ReactPointerEvent<HTMLElement>, cancelled: boolean): void => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    cbsRef.current.onEnd({ cancelled, pointerId: e.pointerId })
  }, [])

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>): void => {
      endDrag(e, false)
    },
    [endDrag],
  )

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLElement>): void => {
      endDrag(e, true)
    },
    [endDrag],
  )

  const onLostPointerCapture = useCallback(
    (e: ReactPointerEvent<HTMLElement>): void => {
      // No-op when the drag already ended normally (dragRef cleared by up/cancel).
      endDrag(e, true)
    },
    [endDrag],
  )

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture }
}
