import {
  useRef,
  useState,
  useEffect,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { SidebarToggleButton } from '../SidebarToggleButton'
import SidebarTabs, { type TabConfig } from '../SidebarTabs'
import { usePointerDrag } from '@/hooks/usePointerDrag'
import { SIDEBAR_MIN_WIDTH, clampSidebarWidth } from './sidebarLayout'

const RESIZE_THRESHOLD_PX = 5
/** Width of the full-height grab strip on the inner edge of an open sidebar. */
const EDGE_GRAB_PX = 8

export type SidebarLayoutMode = 'overlay' | 'inline'

export interface SidebarProps {
  side: 'left' | 'right'
  isOpen: boolean
  onToggle: () => void
  tabConfig: readonly TabConfig<string>[]
  activeTab: string
  onTabChange: (tab: string) => void
  children: ReactNode
  width?: number
  toggleLogContext: string
  /** When set, the toggle button also acts as a resize handle and this is called with the new width. */
  onWidthChange?: (width: number) => void
  /** When true, aside uses overflow: visible so content (e.g. Monaco IntelliSense) is not clipped. */
  overflowVisible?: boolean
  /** Rendered at the right end of the tab row (see SidebarTabs `trailing`). */
  tabsTrailing?: ReactNode
  /**
   * `overlay` — absolute positioned over the canvas (default).
   * `inline` — participates in flex row layout (docked Builder right panel).
   */
  layout?: SidebarLayoutMode
}

export default function Sidebar({
  side,
  isOpen,
  onToggle,
  tabConfig,
  activeTab,
  onTabChange,
  children,
  width = 240,
  toggleLogContext,
  onWidthChange,
  overflowVisible = false,
  tabsTrailing,
  layout = 'overlay',
}: SidebarProps) {
  const isLeft = side === 'left'
  const isOverlay = layout === 'overlay'
  const [isResizing, setIsResizing] = useState(false)

  const [_viewportRevision, bumpViewportRevision] = useState(0)
  useEffect(() => {
    const onResize = () => bumpViewportRevision((n) => n + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const effectiveWidth = clampSidebarWidth(width)

  const resizeStartRef = useRef<{ startWidth: number; toggleOnClick: boolean; resizing: boolean } | null>(null)

  const resizeDrag = usePointerDrag({
    onMove: ({ dx }) => {
      const data = resizeStartRef.current
      if (data == null || onWidthChange == null) return
      if (!data.resizing && Math.abs(dx) > RESIZE_THRESHOLD_PX) {
        data.resizing = true
        setIsResizing(true)
      }
      if (data.resizing) {
        const delta = isLeft ? dx : -dx
        onWidthChange(clampSidebarWidth(data.startWidth + delta))
      }
    },
    onEnd: ({ cancelled }) => {
      const data = resizeStartRef.current
      resizeStartRef.current = null
      setIsResizing(false)
      if (!cancelled && data != null && data.toggleOnClick && !data.resizing) {
        onToggle()
      }
    },
  })

  const beginEdgeResize = (e: ReactPointerEvent<HTMLElement>) => {
    resizeStartRef.current = { startWidth: effectiveWidth, toggleOnClick: false, resizing: false }
    resizeDrag.onPointerDown(e)
  }

  const toggleButtonResizeProps =
    onWidthChange != null
      ? {
          onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
            resizeStartRef.current = { startWidth: effectiveWidth, toggleOnClick: true, resizing: false }
            resizeDrag.onPointerDown(e)
          },
          onPointerMove: resizeDrag.onPointerMove,
          onPointerUp: resizeDrag.onPointerUp,
          onPointerCancel: resizeDrag.onPointerCancel,
          onLostPointerCapture: resizeDrag.onLostPointerCapture,
        }
      : undefined

  const outerStyle: CSSProperties = {
    display: 'flex',
    height: '100%',
    minHeight: 0,
    zIndex: 100,
    pointerEvents: isOpen ? 'auto' : 'none',
    flexDirection: isLeft ? 'row' : 'row-reverse',
    ...(isOverlay
      ? {
          position: 'absolute',
          [side]: 0,
          top: 0,
          bottom: 0,
        }
      : {
          position: 'relative',
          flexShrink: 0,
          alignSelf: 'stretch',
        }),
  }

  return (
    <div style={outerStyle}>
      <aside
        style={{
          width: isOpen ? effectiveWidth : 0,
          minWidth: isOpen ? SIDEBAR_MIN_WIDTH : 0,
          [isLeft ? 'borderRight' : 'borderLeft']: '1px solid #2f3545',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: isOpen ? (overflowVisible ? 'visible' : 'hidden') : 'hidden',
          transition: isResizing ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          backgroundColor: 'rgba(27, 31, 42, 0.7)',
          boxShadow: isOpen ? `${isLeft ? '2' : '-2'}px 0 12px rgba(0,0,0,0.45)` : 'none',
          color: '#e6e9f2',
        }}
      >
        {/* Keep mounted when closed so portaled UI (e.g. Workspace) survives drawer collapse. */}
        <div style={{ display: isOpen ? 'contents' : 'none' }}>
          <SidebarTabs
            tabConfig={tabConfig}
            activeTab={activeTab}
            onTabChange={onTabChange}
            trailing={tabsTrailing}
          />
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: overflowVisible ? 'visible' : 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {children}
          </div>
        </div>
      </aside>

      {isOpen && onWidthChange != null ?
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${side} sidebar`}
          data-testid={`sidebar-edge-resize-${side}`}
          onPointerDown={beginEdgeResize}
          onPointerMove={resizeDrag.onPointerMove}
          onPointerUp={resizeDrag.onPointerUp}
          onPointerCancel={resizeDrag.onPointerCancel}
          onLostPointerCapture={resizeDrag.onLostPointerCapture}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: EDGE_GRAB_PX,
            [isLeft ? 'left' : 'right']: effectiveWidth - 2,
            cursor: 'ew-resize',
            zIndex: 1000,
            touchAction: 'none',
            transition: isResizing ? 'none' : 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      : null}

      <SidebarToggleButton
        isOpen={isOpen}
        onToggle={onToggle}
        side={side}
        logContext={toggleLogContext}
        resizeHandlePointerProps={toggleButtonResizeProps}
      />
    </div>
  )
}
