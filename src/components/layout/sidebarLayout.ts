import { clamp } from '@/utils/numberUtils'

/** Minimum sidebar width (resize + open state). */
export const SIDEBAR_MIN_WIDTH = 180

const VIEWPORT_RESERVE_PX = 24

/** Upper bound for sidebar width so the panel stays within the browser viewport. */
export function getSidebarViewportMaxWidth(): number {
  if (typeof window === 'undefined') return 100_000
  return Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - VIEWPORT_RESERVE_PX)
}

export function clampSidebarWidth(width: number): number {
  return clamp(width, SIDEBAR_MIN_WIDTH, getSidebarViewportMaxWidth())
}
