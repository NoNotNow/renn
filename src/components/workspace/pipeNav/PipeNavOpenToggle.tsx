import type { CSSProperties } from 'react'
import { theme } from '@/config/theme'

export interface PipeNavOpenToggleProps {
  onClick: () => void
}

/** Slim sidebar opener aligned with the horizontal pipeline strip. */
export default function PipeNavOpenToggle({ onClick }: PipeNavOpenToggleProps) {
  return (
    <button
      type="button"
      title="Open pipe navigation"
      data-testid="pipe-nav-open"
      onClick={onClick}
      style={toggleStyle}
    >
      »
    </button>
  )
}

const toggleStyle: CSSProperties = {
  width: 14,
  height: 36,
  padding: 0,
  marginRight: 4,
  flexShrink: 0,
  alignSelf: 'center',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
  borderRadius: '0 4px 4px 0',
  border: `1px solid ${theme.pipeNav.accentMuted}`,
  borderLeft: 'none',
  background: theme.pipeNav.sidebarBg,
  color: theme.pipeNav.accent,
  cursor: 'pointer',
}
