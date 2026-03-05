import { useRef, useState, useCallback } from 'react'
import { clamp } from '@/utils/numberUtils'
import { SidebarToggleButton } from '../SidebarToggleButton'
import SidebarTabs, { type TabConfig } from '../SidebarTabs'

const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 800
const RESIZE_THRESHOLD_PX = 5

export interface SidebarProps {
  side: 'left' | 'right'
  isOpen: boolean
  onToggle: () => void
  tabConfig: readonly TabConfig<string>[]
  activeTab: string
  onTabChange: (tab: string) => void
  children: React.ReactNode
  width?: number
  toggleLogContext: string
  /** When set, the toggle button also acts as a resize handle and this is called with the new width. */
  onWidthChange?: (width: number) => void
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
}: SidebarProps) {
  const isLeft = side === 'left'
  const [isResizing, setIsResizing] = useState(false)
  const resizeRef = useRef<{ startX: number; startWidth: number; resizing: boolean } | null>(null)

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (onWidthChange == null) return
      resizeRef.current = {
        startX: e.clientX,
        startWidth: width,
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
          const newWidth = clamp(data.startWidth + delta, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH)
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
    [isLeft, width, onWidthChange, onToggle]
  )

  return (
    <div
      style={{
        position: 'absolute',
        [side]: 0,
        top: 0,
        bottom: 0,
        display: 'flex',
        height: '100%',
        zIndex: 100,
        pointerEvents: isOpen ? 'auto' : 'none',
        flexDirection: isLeft ? 'row' : 'row-reverse',
      }}
    >
      <aside
        style={{
          width: isOpen ? width : 0,
          [isLeft ? 'borderRight' : 'borderLeft']: '1px solid #2f3545',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: isOpen ? 'auto' : 'hidden',
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
