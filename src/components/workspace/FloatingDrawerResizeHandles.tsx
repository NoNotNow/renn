import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import type { DrawerResizeEdge } from '@/components/workspace/floatingDrawerLayout'
import { FLOATING_DRAWER_HEADER_HEIGHT_PX } from '@/components/workspace/floatingDrawerLayout'

const resizeHandleBase: CSSProperties = {
  position: 'absolute',
  zIndex: 2,
  background: 'transparent',
}

interface ResizeHandleSpec {
  edge: DrawerResizeEdge
  title: string
  orientation: 'vertical' | 'horizontal'
  style: CSSProperties
}

/** Default drawer edges: left/right/bottom plus both bottom corners (unchanged WorkspaceFloatingDrawer behavior). */
const DEFAULT_EDGES: readonly DrawerResizeEdge[] = ['left', 'right', 'bottom', 'left-corner', 'corner']

const HANDLE_SPECS: Record<DrawerResizeEdge, ResizeHandleSpec> = {
  left: {
    edge: 'left',
    title: 'Resize width from left',
    orientation: 'vertical',
    style: { top: FLOATING_DRAWER_HEADER_HEIGHT_PX, left: 0, width: 6, bottom: 6, cursor: 'ew-resize' },
  },
  right: {
    edge: 'right',
    title: 'Resize width from right',
    orientation: 'vertical',
    style: { top: FLOATING_DRAWER_HEADER_HEIGHT_PX, right: 0, width: 6, bottom: 6, cursor: 'ew-resize' },
  },
  bottom: {
    edge: 'bottom',
    title: 'Resize height',
    orientation: 'horizontal',
    style: { left: 6, right: 6, bottom: 0, height: 6, cursor: 'ns-resize' },
  },
  top: {
    edge: 'top',
    title: 'Resize height from top',
    orientation: 'horizontal',
    style: { left: 6, right: 6, top: 0, height: 6, cursor: 'ns-resize' },
  },
  'left-corner': {
    edge: 'left-corner',
    title: 'Resize width and height from left',
    orientation: 'vertical',
    style: { left: 0, bottom: 0, width: 12, height: 12, cursor: 'nesw-resize' },
  },
  corner: {
    edge: 'corner',
    title: 'Resize width and height from right',
    orientation: 'vertical',
    style: { right: 0, bottom: 0, width: 12, height: 12, cursor: 'nwse-resize' },
  },
  'top-corner': {
    edge: 'top-corner',
    title: 'Resize width and height from top right',
    orientation: 'vertical',
    style: { right: 0, top: 0, width: 12, height: 12, cursor: 'nwse-resize' },
  },
  'top-left-corner': {
    edge: 'top-left-corner',
    title: 'Resize width and height from top left',
    orientation: 'vertical',
    style: { left: 0, top: 0, width: 12, height: 12, cursor: 'nesw-resize' },
  },
}

export interface FloatingDrawerResizeHandlesProps {
  headerHeightPx?: number
  /** Which edges/corners get a handle; defaults to the drawer set (left/right/bottom + bottom corners). */
  edges?: readonly DrawerResizeEdge[]
  onResizeMouseDown: (edge: DrawerResizeEdge) => (e: ReactMouseEvent) => void
}

export default function FloatingDrawerResizeHandles({
  headerHeightPx,
  edges = DEFAULT_EDGES,
  onResizeMouseDown,
}: FloatingDrawerResizeHandlesProps) {
  return (
    <>
      {edges.map((edge) => {
        const spec = HANDLE_SPECS[edge]
        const style =
          headerHeightPx != null && (edge === 'left' || edge === 'right')
            ? { ...spec.style, top: headerHeightPx }
            : spec.style
        return (
          <div
            key={edge}
            role="separator"
            aria-orientation={spec.orientation}
            data-testid={`resize-handle-${edge}`}
            title={spec.title}
            onMouseDown={onResizeMouseDown(edge)}
            style={{ ...resizeHandleBase, ...style }}
          />
        )
      })}
    </>
  )
}
