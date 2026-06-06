import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { theme } from '@/config/theme'
import { ANCHORED_POPOVER_WIDTH_PX, useAnchoredPopover } from '@/hooks/useAnchoredPopover'

export const anchoredPopoverShellStyle: CSSProperties = {
  position: 'fixed',
  width: ANCHORED_POPOVER_WIDTH_PX,
  padding: 14,
  boxSizing: 'border-box',
  background: theme.bg.panel,
  border: `1px solid ${theme.border.default}`,
  borderRadius: 10,
  boxShadow: '0 14px 48px rgba(0, 0, 0, 0.55)',
}

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
