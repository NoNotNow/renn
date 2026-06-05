import type { CSSProperties, ReactNode } from 'react'
import { EntityPanelIcons } from '@/components/EntityPanelIcons'
import { entityPanelIconButtonStyle } from '@/components/sharedStyles'
import { theme } from '@/config/theme'

export interface WorkspaceMonacoSlotProps {
  monacoSlot: ReactNode
  onRefresh: () => void
  testId?: string
  style?: CSSProperties
}

/** Shared Monaco mount with a floating refresh icon in the top-right corner. */
export default function WorkspaceMonacoSlot({
  monacoSlot,
  onRefresh,
  testId = 'workspace-monaco-refresh-editor',
  style,
}: WorkspaceMonacoSlotProps) {
  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{monacoSlot}</div>
      <button
        type="button"
        data-testid={testId}
        onClick={onRefresh}
        title="Reload Monaco editor (layout escape hatch)"
        aria-label="Refresh editor"
        style={{
          ...entityPanelIconButtonStyle,
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 5,
          opacity: 0.8,
          cursor: 'pointer',
          background: theme.bg.surface,
          border: `1px solid ${theme.border.default}`,
          boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.8'
        }}
      >
        {EntityPanelIcons.refresh}
      </button>
    </div>
  )
}
