import type { CSSProperties } from 'react'
import { theme } from '@/config/theme'
import { ANCHORED_POPOVER_WIDTH_PX } from '@/hooks/useAnchoredPopover'

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
