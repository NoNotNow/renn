import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import FloatingDrawerResizeHandles from '@/components/workspace/FloatingDrawerResizeHandles'
import {
  computeDrawerResizeNext,
  readStoredDrawerLayout,
  type DrawerResizeEdge,
  writeStoredDrawerLayout,
  type StoredDrawerLayout,
} from '@/components/workspace/floatingDrawerLayout'
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

export type WorkspaceFloatingDrawerAnchor = 'left' | 'top-right' | 'left-of-editor-toolbar'

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
  /** Used when anchor is `left-of-editor-toolbar`. */
  toolbarInsetPx?: number
  /** When set, last drag position (and size when `resizable`) is restored on reopen. */
  positionStorageKey?: string
  width?: number
  /** CSS max-height when `resizable` is false. */
  maxHeight?: number | string
  headerExtra?: ReactNode
  bodyPadding?: number | string
  /** When true, drag any edge or corner to resize the drawer. */
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
  toolbarInsetPx: number,
): { x: number; y: number } {
  if (anchor === 'top-right') {
    const hostWidth = portalTarget.clientWidth
    return {
      x: Math.max(10, hostWidth - width - 12),
      y: initialTop,
    }
  }
  if (anchor === 'left-of-editor-toolbar') {
    const hostWidth = portalTarget.clientWidth
    return {
      x: Math.max(10, hostWidth - toolbarInsetPx - width - 8),
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
  toolbarInsetPx = 36,
  positionStorageKey,
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
  const storedLayout = useMemo(
    () =>
      positionStorageKey != null && typeof window !== 'undefined'
        ? readStoredDrawerLayout(positionStorageKey)
        : null,
    [positionStorageKey],
  )

  const initialPos = useMemo(() => {
    if (storedLayout) return { x: storedLayout.x, y: storedLayout.y }
    return resolveInitialPosition(anchor, portalTarget, initialLeft, initialTop, width, toolbarInsetPx)
  }, [anchor, initialLeft, initialTop, portalTarget, storedLayout, toolbarInsetPx, width])

  const initialSize = useMemo(() => {
    if (resizable && storedLayout?.width != null && storedLayout?.height != null) {
      return { width: storedLayout.width, height: storedLayout.height }
    }
    return { width, height: initialHeight }
  }, [initialHeight, resizable, storedLayout, width])

  const [pos, setPos] = useState(initialPos)
  const posRef = useRef(initialPos)
  posRef.current = pos
  const [size, setSize] = useState(initialSize)
  const sizeRef = useRef(initialSize)
  sizeRef.current = size
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const resizeRef = useRef<{
    edge: DrawerResizeEdge
    startX: number
    startY: number
    startWidth: number
    startHeight: number
    startPosX: number
  } | null>(null)

  const effectiveWidth = resizable ? size.width : width
  const effectiveMaxHeight = resizable ? undefined : maxHeightProp

  const persistLayout = useCallback(
    (nextPos: { x: number; y: number }, nextSize?: { width: number; height: number }) => {
      if (positionStorageKey == null) return
      const layout: StoredDrawerLayout = { x: nextPos.x, y: nextPos.y }
      if (resizable && nextSize != null) {
        layout.width = nextSize.width
        layout.height = nextSize.height
      }
      writeStoredDrawerLayout(positionStorageKey, layout)
    },
    [positionStorageKey, resizable],
  )

  const handleClose = useCallback(() => {
    persistLayout(pos, resizable ? size : undefined)
    onClose()
  }, [onClose, persistLayout, pos, resizable, size])

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
      const next = {
        x: dragRef.current.startPosX + dx,
        y: dragRef.current.startPosY + dy,
      }
      posRef.current = next
      setPos(next)
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      persistLayout(posRef.current, resizable ? sizeRef.current : undefined)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const handleResizeMouseDown = (edge: DrawerResizeEdge) => (e: ReactMouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = {
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: size.width,
      startHeight: size.height,
      startPosX: posRef.current.x,
    }
    const onMove = (move: MouseEvent) => {
      if (!resizeRef.current) return
      const { edge: resizeEdge, startX, startY, startWidth, startHeight, startPosX } = resizeRef.current
      const hostWidth = portalTarget.clientWidth
      const hostMaxWidth = maxWidth ?? Math.max(minWidth, hostWidth - 20)
      const next = computeDrawerResizeNext({
        edge: resizeEdge,
        dx: move.clientX - startX,
        dy: move.clientY - startY,
        startWidth,
        startHeight,
        startPosX,
        minWidth,
        minHeight,
        maxWidth: hostMaxWidth,
        maxHeight: maxResizeHeight,
      })

      const nextSize = { width: next.width, height: next.height }
      sizeRef.current = nextSize
      setSize(nextSize)
      if (next.posX != null) {
        const nextPos = { x: next.posX, y: posRef.current.y }
        posRef.current = nextPos
        setPos(nextPos)
      }
    }
    const onUp = () => {
      resizeRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      persistLayout(posRef.current, resizable ? sizeRef.current : undefined)
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
              handleClose()
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
      {resizable ? <FloatingDrawerResizeHandles onResizeMouseDown={handleResizeMouseDown} /> : null}
    </div>,
    portalTarget,
  )
}
