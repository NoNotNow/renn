import type { CSSProperties } from 'react'
import { entityPanelIconButtonStyle } from '@/components/sharedStyles'
import { theme } from '@/config/theme'

export const workspaceMonacoToolbarButtonStyle: CSSProperties = {
  ...entityPanelIconButtonStyle,
  opacity: 0.8,
  cursor: 'pointer',
  background: theme.bg.surface,
  border: `1px solid ${theme.border.default}`,
  boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
}
