import { clamp } from '@/utils/numberUtils'

export type DrawerResizeEdge =
  | 'left'
  | 'right'
  | 'bottom'
  | 'top'
  | 'corner'
  | 'left-corner'
  | 'top-corner'
  | 'top-left-corner'

/** Every edge + corner a resizable panel can be dragged from (all-sides resize). */
export const DRAWER_RESIZE_EDGES_ALL: readonly DrawerResizeEdge[] = [
  'left',
  'right',
  'bottom',
  'top',
  'corner',
  'left-corner',
  'top-corner',
  'top-left-corner',
]

export type StoredDrawerLayout = {
  x: number
  y: number
  width?: number
  height?: number
}

export const FLOATING_DRAWER_HEADER_HEIGHT_PX = 29

export function readStoredDrawerLayout(key: string): StoredDrawerLayout | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredDrawerLayout>
    if (
      typeof parsed.x === 'number' &&
      Number.isFinite(parsed.x) &&
      typeof parsed.y === 'number' &&
      Number.isFinite(parsed.y)
    ) {
      const layout: StoredDrawerLayout = { x: parsed.x, y: parsed.y }
      if (typeof parsed.width === 'number' && Number.isFinite(parsed.width) && parsed.width > 0) {
        layout.width = parsed.width
      }
      if (typeof parsed.height === 'number' && Number.isFinite(parsed.height) && parsed.height > 0) {
        layout.height = parsed.height
      }
      return layout
    }
  } catch {
    /* quota / parse */
  }
  return null
}

export function writeStoredDrawerLayout(key: string, layout: StoredDrawerLayout): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(layout))
  } catch {
    /* quota */
  }
}

export interface DrawerResizeInput {
  edge: DrawerResizeEdge
  dx: number
  dy: number
  startWidth: number
  startHeight: number
  startPosX: number
  startPosY: number
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
}

export interface DrawerResizeResult {
  width: number
  height: number
  posX?: number
  posY?: number
}

export function clampDrawerPosition(
  pos: { x: number; y: number },
  drawer: { width: number; height: number },
  host: { width: number; height: number },
): { x: number; y: number } {
  if (host.width <= 0 || host.height <= 0) return pos
  const maxX = Math.max(0, host.width - drawer.width)
  const maxY = Math.max(0, host.height - drawer.height)
  return {
    x: clamp(pos.x, 0, maxX),
    y: clamp(pos.y, 0, maxY),
  }
}

/** Position of `element` in the coordinate space of `host` (both layout boxes). */
export function drawerPositionRelativeToHost(element: Element, host: Element): { x: number; y: number } {
  const hostRect = host.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  return {
    x: elementRect.left - hostRect.left,
    y: elementRect.top - hostRect.top,
  }
}

export function computeDrawerResizeNext(input: DrawerResizeInput): DrawerResizeResult {
  const { edge, dx, dy, startWidth, startHeight, startPosX, startPosY, minWidth, minHeight, maxWidth, maxHeight } = input

  let nextWidth = startWidth
  let nextHeight = startHeight
  let posX: number | undefined
  let posY: number | undefined

  if (edge === 'right' || edge === 'corner' || edge === 'top-corner') {
    nextWidth = clamp(startWidth + dx, minWidth, maxWidth)
  } else if (edge === 'left' || edge === 'left-corner' || edge === 'top-left-corner') {
    nextWidth = clamp(startWidth - dx, minWidth, maxWidth)
    posX = startPosX + (startWidth - nextWidth)
  }

  if (edge === 'bottom' || edge === 'corner' || edge === 'left-corner') {
    nextHeight = clamp(startHeight + dy, minHeight, maxHeight)
  } else if (edge === 'top' || edge === 'top-corner' || edge === 'top-left-corner') {
    nextHeight = clamp(startHeight - dy, minHeight, maxHeight)
    posY = startPosY + (startHeight - nextHeight)
  }

  return { width: nextWidth, height: nextHeight, posX, posY }
}
