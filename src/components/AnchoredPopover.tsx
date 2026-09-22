import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { theme } from '@/config/theme'
import { ANCHORED_POPOVER_WIDTH_PX, useAnchoredPopover } from '@/hooks/useAnchoredPopover'
import { anchoredPopoverShellStyle } from './anchoredPopoverStyles'

export interface AnchoredPopoverProps {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  ariaLabel: string
  children: ReactNode
  panelWidth?: number
  zIndex?: number
  id?: string
  className?: string
  testId?: string
  /** CSS selector; pointer-down inside matching elements does not close. */
  ignoreCloseWithinSelector?: string
  closeOnEscape?: boolean
  style?: CSSProperties
}

/** Small anchored panel portaled to `document.body` (brush tools, filter chips). */
export default function AnchoredPopover({
  open,
  anchorRef,
  onClose,
  ariaLabel,
  children,
  panelWidth,
  zIndex = theme.zIndex.popover,
  id,
  className,
  testId,
  ignoreCloseWithinSelector,
  closeOnEscape,
  style,
}: AnchoredPopoverProps) {
  const { panelRef, pos } = useAnchoredPopover({
    open,
    anchorRef,
    onClose,
    panelWidth,
    ignoreCloseWithinSelector,
    closeOnEscape,
  })

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      className={className}
      role="dialog"
      aria-label={ariaLabel}
      data-testid={testId}
      style={{
        ...anchoredPopoverShellStyle,
        top: pos.top,
        left: pos.left,
        zIndex,
        width: panelWidth ?? ANCHORED_POPOVER_WIDTH_PX,
        ...style,
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
