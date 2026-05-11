import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { clamp } from '@/utils/numberUtils'
import { SidebarToggleButton } from '../SidebarToggleButton'
import SidebarTabs, { type TabConfig } from '../SidebarTabs'

/** Minimum sidebar width (resize + open state). */
export const SIDEBAR_MIN_WIDTH = 180

const VIEWPORT_RESERVE_PX = 24
const RESIZE_THRESHOLD_PX = 5

/** Upper bound for sidebar width so the panel stays within the browser viewport. */
export function getSidebarViewportMaxWidth(): number {
  if (typeof window === 'undefined') return 100_000
  return Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - VIEWPORT_RESERVE_PX)
}

function clampSidebarWidth(width: number): number {
  return clamp(width, SIDEBAR_MIN_WIDTH, getSidebarViewportMaxWidth())
}

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
  const resizeRef = useRef<{ startX: number; startWidth: number; resizing: boolean } | null>(null)

  const [_viewportRevision, bumpViewportRevision] = useState(0)
  useEffect(() => {
    const onResize = () => bumpViewportRevision((n) => n + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const effectiveWidth = clampSidebarWidth(width)

  const handleResizeMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>) => {
      if (onWidthChange == null) return
      resizeRef.current = {
        startX: e.clientX,
        startWidth: effectiveWidth,
        resizing: false,
      }
      const onMouseMove = (moveEvent: MouseEvent) => {
        const data = resizeRef.current
        if (data == null) return
        const deltaX = Math.abs(moveEvent.clientX - data.startX)
        if (!data.resizing && deltaX > RESIZE_THRESHOLD_PX) {
          data.resizing = true
          setIsResizing(true)
        }
        if (data.resizing) {
          const delta = isLeft ? moveEvent.clientX - data.startX : data.startX - moveEvent.clientX
          const newWidth = clampSidebarWidth(data.startWidth + delta)
          onWidthChange(newWidth)
        }
      }
      const onMouseUp = () => {
        const data = resizeRef.current
        resizeRef.current = null
        setIsResizing(false)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        if (data != null && !data.resizing) {
          onToggle()
        }
      }
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [isLeft, effectiveWidth, onWidthChange, onToggle]
  )

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
          overflow: isOpen ? (overflowVisible ? 'visible' : 'auto') : 'hidden',
          transition: isResizing ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          backgroundColor: 'rgba(27, 31, 42, 0.7)',
          boxShadow: isOpen ? `${isLeft ? '2' : '-2'}px 0 12px rgba(0,0,0,0.45)` : 'none',
          color: '#e6e9f2',
        }}
      >
        {isOpen && (
          <>
            <SidebarTabs
              tabConfig={tabConfig}
              activeTab={activeTab}
              onTabChange={onTabChange}
              trailing={tabsTrailing}
            />
            {children}
          </>
        )}
      </aside>

      <SidebarToggleButton
        isOpen={isOpen}
        onToggle={onToggle}
        side={side}
        logContext={toggleLogContext}
        onResizeHandleMouseDown={onWidthChange != null ? handleResizeMouseDown : undefined}
      />
    </div>
  )
}
