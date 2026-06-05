import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { theme } from '@/config/theme'
import { clamp } from '@/utils/numberUtils'

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
  /** CSS max-height when `resizable` is false. */
  maxHeight?: number | string
  headerExtra?: ReactNode
  bodyPadding?: number | string
  /** When true, drag the right/bottom edges or corner to resize the drawer. */
  resizable?: boolean
  initialHeight?: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  /** Pixel cap for user-resized drawer height. */
  maxResizeHeight?: number
  bodyOverflow?: 'auto' | 'hidden'
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

const DRAWER_HEADER_HEIGHT_PX = 29

type ResizeEdge = 'right' | 'bottom' | 'corner'

export default function WorkspaceFloatingDrawer({
  title,
  children,
  onClose,
  portalTarget,
  initialLeft = 0,
  initialTop = 12,
  anchor = 'left',
  width = 360,
  maxHeight: maxHeightProp = 'min(50vh, 320px)',
  headerExtra,
  bodyPadding = 8,
  resizable = false,
  initialHeight = 280,
  minWidth = 260,
  minHeight = 160,
  maxWidth,
  maxResizeHeight = 640,
  bodyOverflow = 'auto',
  testId,
}: WorkspaceFloatingDrawerProps) {
  const initialPos = resolveInitialPosition(anchor, portalTarget, initialLeft, initialTop, width)
  const [pos, setPos] = useState(initialPos)
  const [size, setSize] = useState({ width, height: initialHeight })
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const resizeRef = useRef<{
    edge: ResizeEdge
    startX: number
    startY: number
    startWidth: number
    startHeight: number
  } | null>(null)

  const effectiveWidth = resizable ? size.width : width
  const effectiveMaxHeight = resizable ? undefined : maxHeightProp

  useEffect(() => {
    if (!resizable) return
    setSize((s) => (s.width >= width ? s : { ...s, width }))
  }, [resizable, width])

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

  const handleResizeMouseDown = (edge: ResizeEdge) => (e: ReactMouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = {
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: size.width,
      startHeight: size.height,
    }
    const onMove = (move: MouseEvent) => {
      if (!resizeRef.current) return
      const dx = move.clientX - resizeRef.current.startX
      const dy = move.clientY - resizeRef.current.startY
      const hostWidth = portalTarget.clientWidth
      const hostMaxWidth = maxWidth ?? Math.max(minWidth, hostWidth - 20)
      const nextWidth =
        resizeRef.current.edge === 'bottom' ?
          resizeRef.current.startWidth
        : clamp(resizeRef.current.startWidth + dx, minWidth, hostMaxWidth)
      const nextHeight =
        resizeRef.current.edge === 'right' ?
          resizeRef.current.startHeight
        : clamp(resizeRef.current.startHeight + dy, minHeight, maxResizeHeight)
      setSize({ width: nextWidth, height: nextHeight })
    }
    const onUp = () => {
      resizeRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const resizeHandleBase: CSSProperties = {
    position: 'absolute',
    zIndex: 2,
    background: 'transparent',
  }

  return createPortal(
    <div
      data-testid={testId}
      style={{
        ...WORKSPACE_FLOATING_DRAWER_STYLE,
        position: 'absolute',
        top: pos.y,
        left: pos.x,
        width: effectiveWidth,
        height: resizable ? size.height : undefined,
        maxHeight: effectiveMaxHeight,
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
      <div style={{ padding: bodyPadding, overflow: bodyOverflow, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      {resizable ?
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            title="Resize width"
            onMouseDown={handleResizeMouseDown('right')}
            style={{
              ...resizeHandleBase,
              top: DRAWER_HEADER_HEIGHT_PX,
              right: 0,
              width: 6,
              bottom: 6,
              cursor: 'ew-resize',
            }}
          />
          <div
            role="separator"
            aria-orientation="horizontal"
            title="Resize height"
            onMouseDown={handleResizeMouseDown('bottom')}
            style={{
              ...resizeHandleBase,
              left: 0,
              right: 6,
              bottom: 0,
              height: 6,
              cursor: 'ns-resize',
            }}
          />
          <div
            title="Resize width and height"
            onMouseDown={handleResizeMouseDown('corner')}
            style={{
              ...resizeHandleBase,
              right: 0,
              bottom: 0,
              width: 12,
              height: 12,
              cursor: 'nwse-resize',
            }}
          />
        </>
      : null}
    </div>,
    portalTarget,
  )
}
