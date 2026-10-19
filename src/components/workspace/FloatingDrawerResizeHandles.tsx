import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { DrawerResizeEdge } from '@/components/workspace/floatingDrawerLayout'
import { FLOATING_DRAWER_HEADER_HEIGHT_PX } from '@/components/workspace/floatingDrawerLayout'

const resizeHandleBase: CSSProperties = {
  position: 'absolute',
  zIndex: 2,
  background: 'transparent',
  touchAction: 'none',
}

/** Touch hit target for edge/corner handles; visual grab area inside the drawer is unchanged. */
const HANDLE_HIT_PX = 24
const EDGE_INSIDE_PX = 6
const CORNER_INSIDE_PX = 12

export interface ResizeHandlePointerProps {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void
  onLostPointerCapture: (e: ReactPointerEvent<HTMLElement>) => void
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
    style: {
      top: FLOATING_DRAWER_HEADER_HEIGHT_PX,
      left: -(HANDLE_HIT_PX - EDGE_INSIDE_PX),
      width: HANDLE_HIT_PX,
      bottom: EDGE_INSIDE_PX,
      cursor: 'ew-resize',
    },
  },
  right: {
    edge: 'right',
    title: 'Resize width from right',
    orientation: 'vertical',
    style: {
      top: FLOATING_DRAWER_HEADER_HEIGHT_PX,
      right: -(HANDLE_HIT_PX - EDGE_INSIDE_PX),
      width: HANDLE_HIT_PX,
      bottom: EDGE_INSIDE_PX,
      cursor: 'ew-resize',
    },
  },
  bottom: {
    edge: 'bottom',
    title: 'Resize height',
    orientation: 'horizontal',
    style: {
      left: EDGE_INSIDE_PX,
      right: EDGE_INSIDE_PX,
      bottom: -(HANDLE_HIT_PX - EDGE_INSIDE_PX),
      height: HANDLE_HIT_PX,
      cursor: 'ns-resize',
    },
  },
  top: {
    edge: 'top',
    title: 'Resize height from top',
    orientation: 'horizontal',
    style: {
      left: EDGE_INSIDE_PX,
      right: EDGE_INSIDE_PX,
      top: -(HANDLE_HIT_PX - EDGE_INSIDE_PX),
      height: HANDLE_HIT_PX,
      cursor: 'ns-resize',
    },
  },
  'left-corner': {
    edge: 'left-corner',
    title: 'Resize width and height from left',
    orientation: 'vertical',
    style: {
      left: -(HANDLE_HIT_PX - CORNER_INSIDE_PX),
      bottom: -(HANDLE_HIT_PX - CORNER_INSIDE_PX),
      width: HANDLE_HIT_PX,
      height: HANDLE_HIT_PX,
      cursor: 'nesw-resize',
    },
  },
  corner: {
    edge: 'corner',
    title: 'Resize width and height from right',
    orientation: 'vertical',
    style: {
      right: -(HANDLE_HIT_PX - CORNER_INSIDE_PX),
      bottom: -(HANDLE_HIT_PX - CORNER_INSIDE_PX),
      width: HANDLE_HIT_PX,
      height: HANDLE_HIT_PX,
      cursor: 'nwse-resize',
    },
  },
  'top-corner': {
    edge: 'top-corner',
    title: 'Resize width and height from top right',
    orientation: 'vertical',
    style: {
      right: -(HANDLE_HIT_PX - CORNER_INSIDE_PX),
      top: -(HANDLE_HIT_PX - CORNER_INSIDE_PX),
      width: HANDLE_HIT_PX,
      height: HANDLE_HIT_PX,
      cursor: 'nwse-resize',
    },
  },
  'top-left-corner': {
    edge: 'top-left-corner',
    title: 'Resize width and height from top left',
    orientation: 'vertical',
    style: {
      left: -(HANDLE_HIT_PX - CORNER_INSIDE_PX),
      top: -(HANDLE_HIT_PX - CORNER_INSIDE_PX),
      width: HANDLE_HIT_PX,
      height: HANDLE_HIT_PX,
      cursor: 'nesw-resize',
    },
  },
}

export interface FloatingDrawerResizeHandlesProps {
  headerHeightPx?: number
  /** Which edges/corners get a handle; defaults to the drawer set (left/right/bottom + bottom corners). */
  edges?: readonly DrawerResizeEdge[]
  onResizeHandleProps: (edge: DrawerResizeEdge) => ResizeHandlePointerProps
}

export default function FloatingDrawerResizeHandles({
  headerHeightPx,
  edges = DEFAULT_EDGES,
  onResizeHandleProps,
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
            {...onResizeHandleProps(edge)}
            style={{ ...resizeHandleBase, ...style }}
          />
        )
      })}
    </>
  )
}
