/**
 * Block macOS trackpad "swipe between pages" (browser back/forward overlay).
 * Horizontal two-finger swipes emit wheel events with deltaX; without preventDefault
 * Chrome/Safari show the left/right arrow and can navigate away from the SPA.
 */

import { BUILDER_SCENE_CANVAS_HOST_ATTR } from '@/config/constants'

function elementIsHorizontallyScrollable(el: Element | null): boolean {
  let n: Element | null = el
  while (n) {
    if (n instanceof HTMLElement) {
      const { overflowX } = getComputedStyle(n)
      if ((overflowX === 'auto' || overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 1) {
        return true
      }
    }
    n = n.parentElement
  }
  return false
}

function isInsideSceneCanvasHost(el: Element | null): boolean {
  return el?.closest(`[${BUILDER_SCENE_CANVAS_HOST_ATTR}]`) != null
}

function isHorizontalTrackpadSwipe(ev: WheelEvent): boolean {
  return Math.abs(ev.deltaX) > Math.abs(ev.deltaY) && Math.abs(ev.deltaX) > 0
}

/**
 * Install a document capture listener that suppresses horizontal trackpad swipe navigation.
 * Vertical scroll in side panels is untouched; horizontally scrollable regions are exempt.
 */
export function installPreventTrackpadSwipeNavigation(): void {
  const onWheel = (e: Event): void => {
    const ev = e as WheelEvent
    if (!isHorizontalTrackpadSwipe(ev)) return
    if (elementIsHorizontallyScrollable(ev.target as Element | null)) return
    ev.preventDefault()
  }

  document.addEventListener('wheel', onWheel, { passive: false, capture: true })
}

export { elementIsHorizontallyScrollable, isHorizontalTrackpadSwipe, isInsideSceneCanvasHost }
