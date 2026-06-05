import { useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { theme } from '@/config/theme'

const WORKSPACE_FLOATING_DRAWER_STYLE: CSSProperties = {
  position: 'absolute',
  left: 0,
  zIndex: 100,
  margin: 0,
  padding: 8,
  width: 360,
  overflow: 'auto',
  background: theme.bg.modalGlassHeader,
  backdropFilter: 'blur(12px)',
  border: `1px solid ${theme.border.default}`,
  borderRadius: 6,
  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  color: theme.text.muted,
  fontSize: 11,
  textAlign: 'left',
}

export type WorkspaceFloatingDrawerAnchor = 'left' | 'top-right'

export interface WorkspaceFloatingDrawerProps {
  title: string
  children: ReactNode
  onClose: () => void
  portalTarget: Element
  /** Used when anchor is `left`. */
  initialLeft?: number
  initialTop?: number
  /** `top-right` pins to the host's top-right on first paint; still draggable afterward. */
  anchor?: WorkspaceFloatingDrawerAnchor
  width?: number
  maxHeight?: number | string
  headerExtra?: ReactNode
  bodyPadding?: number | string
  testId?: string
}

function resolveInitialPosition(
  anchor: WorkspaceFloatingDrawerAnchor,
  portalTarget: Element,
  initialLeft: number,
  initialTop: number,
  width: number,
): { x: number; y: number } {
  if (anchor === 'top-right') {
    const hostWidth = portalTarget.clientWidth
    return {
      x: Math.max(10, hostWidth - width - 12),
      y: initialTop,
    }
  }
  return { x: initialLeft, y: initialTop }
}

export default function WorkspaceFloatingDrawer({
  title,
  children,
  onClose,
  portalTarget,
  initialLeft = 0,
  initialTop = 12,
  anchor = 'left',
  width = 360,
  maxHeight = 'min(50vh, 320px)',
  headerExtra,
  bodyPadding = 8,
  testId,
}: WorkspaceFloatingDrawerProps) {
  const initialPos = resolveInitialPosition(anchor, portalTarget, initialLeft, initialTop, width)
  const [pos, setPos] = useState(initialPos)
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)

  const handleMouseDown = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return

    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
    }
    const onMove = (move: MouseEvent) => {
      if (!dragRef.current) return
      const dx = move.clientX - dragRef.current.startX
      const dy = move.clientY - dragRef.current.startY
      setPos({
        x: dragRef.current.startPosX + dx,
        y: dragRef.current.startPosY + dy,
      })
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return createPortal(
    <div
      data-testid={testId}
      style={{
        ...WORKSPACE_FLOATING_DRAWER_STYLE,
        position: 'absolute',
        top: pos.y,
        left: pos.x,
        width,
        maxHeight,
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        overflow: 'hidden',
      }}
    >
      <div
        onMouseDown={handleMouseDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '4px 8px',
          background: theme.bg.modalGlassHeader,
          borderBottom: `1px solid ${theme.border.default}`,
          cursor: 'move',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: theme.text.secondary, textTransform: 'uppercase' }}>
          {title}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {headerExtra}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.text.muted,
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: '0 4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Close"
          >
            ×
          </button>
        </div>
      </div>
      <div style={{ padding: bodyPadding, overflow: 'auto', flex: 1, minHeight: 0 }}>{children}</div>
    </div>,
    portalTarget,
  )
}
