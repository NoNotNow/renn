import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { EntityPanelIcons } from '@/components/EntityPanelIcons'
import { entityPanelIconButtonStyle } from '@/components/sharedStyles'
import { theme } from '@/config/theme'
import { WORKSPACE_MONACO_TOOLBAR_WIDTH_PX } from '@/contexts/WorkspaceMonacoEditorAreaContext'

export interface WorkspaceMonacoSlotProps {
  monacoSlot: ReactNode
  onRefresh: () => void
  testId?: string
  style?: CSSProperties
  toolbarExtra?: ReactNode
  overlay?: ReactNode
  /** Host-owned ref to the editor pane (left of the vertical toolbar). */
  editorAreaRef?: RefObject<HTMLDivElement | null>
  /** Fired when the editor pane ref attaches (for overlay portals). */
  onEditorAreaReady?: () => void
}

export const workspaceMonacoToolbarButtonStyle: CSSProperties = {
  ...entityPanelIconButtonStyle,
  opacity: 0.8,
  cursor: 'pointer',
  background: theme.bg.surface,
  border: `1px solid ${theme.border.default}`,
  boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
}

/** Shared Monaco mount with a vertical editor toolbar on the right edge. */
export default function WorkspaceMonacoSlot({
  monacoSlot,
  onRefresh,
  testId = 'workspace-monaco-refresh-editor',
  style,
  toolbarExtra,
  overlay,
  editorAreaRef: externalEditorAreaRef,
  onEditorAreaReady,
}: WorkspaceMonacoSlotProps) {
  const internalEditorAreaRef = useRef<HTMLDivElement>(null)
  const editorAreaRef = externalEditorAreaRef ?? internalEditorAreaRef

  useLayoutEffect(() => {
    if (editorAreaRef.current) onEditorAreaReady?.()
  }, [editorAreaRef, onEditorAreaReady])

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'row',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        ref={editorAreaRef}
        style={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{monacoSlot}</div>
        {overlay}
      </div>
      <div
        data-testid="workspace-monaco-editor-toolbar"
        style={{
          flex: '0 0 auto',
          width: WORKSPACE_MONACO_TOOLBAR_WIDTH_PX,
          alignSelf: 'stretch',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          padding: '6px 4px',
          borderLeft: `1px solid ${theme.border.default}`,
          background: theme.bg.surface,
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          data-testid={testId}
          onClick={onRefresh}
          title="Reload Monaco editor (layout escape hatch)"
          aria-label="Refresh editor"
          style={workspaceMonacoToolbarButtonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.8'
          }}
        >
          {EntityPanelIcons.refresh}
        </button>
        {toolbarExtra}
      </div>
    </div>
  )
}
