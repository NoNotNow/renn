import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { isKeyboardEventInEditableContext } from '@/input/rawInput'

export const ANCHORED_POPOVER_WIDTH_PX = 252
const VIEWPORT_MARGIN_PX = 10
const ANCHOR_GAP_PX = 10

export interface UseAnchoredPopoverOptions {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  panelWidth?: number
  /** CSS selector; pointer-down inside matching elements does not close. */
  ignoreCloseWithinSelector?: string
  closeOnEscape?: boolean
}

/** Positioning, outside-click dismiss, and optional Escape for anchored tool popovers. */
export function useAnchoredPopover({
  open,
  anchorRef,
  onClose,
  panelWidth = ANCHORED_POPOVER_WIDTH_PX,
  ignoreCloseWithinSelector,
  closeOnEscape = true,
}: UseAnchoredPopoverOptions) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const updatePosition = useCallback(() => {
    if (!open || !anchorRef.current) return
    const r = anchorRef.current.getBoundingClientRect()
    let left = r.left
    const top = r.bottom + ANCHOR_GAP_PX
    const vw = window.innerWidth
    if (left + panelWidth > vw - VIEWPORT_MARGIN_PX) left = vw - panelWidth - VIEWPORT_MARGIN_PX
    if (left < VIEWPORT_MARGIN_PX) left = VIEWPORT_MARGIN_PX
    setPos({ top, left })
  }, [anchorRef, open, panelWidth])

  useLayoutEffect(() => {
    updatePosition()
  }, [updatePosition])

  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      const t = e.target as Node
      if (anchorRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      if (ignoreCloseWithinSelector && t instanceof Element && t.closest(ignoreCloseWithinSelector)) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [anchorRef, ignoreCloseWithinSelector, onClose, open])

  useEffect(() => {
    if (!open || !closeOnEscape) return
    const onKey = (e: KeyboardEvent): void => {
      if (isKeyboardEventInEditableContext(e)) return
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeOnEscape, onClose, open])

  return { panelRef, pos }
}
