import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import type { DrawerResizeEdge } from '@/components/workspace/floatingDrawerLayout'
import { FLOATING_DRAWER_HEADER_HEIGHT_PX } from '@/components/workspace/floatingDrawerLayout'

const resizeHandleBase: CSSProperties = {
  position: 'absolute',
  zIndex: 2,
  background: 'transparent',
}

export interface FloatingDrawerResizeHandlesProps {
  headerHeightPx?: number
  onResizeMouseDown: (edge: DrawerResizeEdge) => (e: ReactMouseEvent) => void
}

export default function FloatingDrawerResizeHandles({
  headerHeightPx = FLOATING_DRAWER_HEADER_HEIGHT_PX,
  onResizeMouseDown,
}: FloatingDrawerResizeHandlesProps) {
  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        title="Resize width from left"
        onMouseDown={onResizeMouseDown('left')}
        style={{
          ...resizeHandleBase,
          top: headerHeightPx,
          left: 0,
          width: 6,
          bottom: 6,
          cursor: 'ew-resize',
        }}
      />
      <div
        role="separator"
        aria-orientation="vertical"
        title="Resize width from right"
        onMouseDown={onResizeMouseDown('right')}
        style={{
          ...resizeHandleBase,
          top: headerHeightPx,
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
        onMouseDown={onResizeMouseDown('bottom')}
        style={{
          ...resizeHandleBase,
          left: 6,
          right: 6,
          bottom: 0,
          height: 6,
          cursor: 'ns-resize',
        }}
      />
      <div
        title="Resize width and height from left"
        onMouseDown={onResizeMouseDown('left-corner')}
        style={{
          ...resizeHandleBase,
          left: 0,
          bottom: 0,
          width: 12,
          height: 12,
          cursor: 'nesw-resize',
        }}
      />
      <div
        title="Resize width and height from right"
        onMouseDown={onResizeMouseDown('corner')}
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
  )
}
