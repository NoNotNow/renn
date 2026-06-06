import { clamp } from '@/utils/numberUtils'

export type DrawerResizeEdge = 'left' | 'right' | 'bottom' | 'corner' | 'left-corner'

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
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
}

export interface DrawerResizeResult {
  width: number
  height: number
  posX?: number
}

export function clampDrawerPosition(
  pos: { x: number; y: number },
  drawer: { width: number; height: number },
  host: { width: number; height: number },
): { x: number; y: number } {
  const maxX = Math.max(0, host.width - drawer.width)
  const maxY = Math.max(0, host.height - drawer.height)
  return {
    x: clamp(pos.x, 0, maxX),
    y: clamp(pos.y, 0, maxY),
  }
}

export function computeDrawerResizeNext(input: DrawerResizeInput): DrawerResizeResult {
  const { edge, dx, dy, startWidth, startHeight, startPosX, minWidth, minHeight, maxWidth, maxHeight } = input

  let nextWidth = startWidth
  let nextHeight = startHeight
  let posX: number | undefined

  if (edge === 'right' || edge === 'corner') {
    nextWidth = clamp(startWidth + dx, minWidth, maxWidth)
  } else if (edge === 'left' || edge === 'left-corner') {
    nextWidth = clamp(startWidth - dx, minWidth, maxWidth)
    posX = startPosX + (startWidth - nextWidth)
  }

  if (edge === 'bottom' || edge === 'corner' || edge === 'left-corner') {
    nextHeight = clamp(startHeight + dy, minHeight, maxHeight)
  }

  return { width: nextWidth, height: nextHeight, posX }
}
