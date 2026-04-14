import { useCallback, useEffect, useRef, useState } from 'react'

/** Hide delay for pointer-revealed chrome (e.g. fullscreen control). */
export const POINTER_REVEAL_HIDE_DELAY_MS = 2800

/**
 * Show UI briefly after pointer activity; hide after idle. Uses refs so repeated
 * pointer events while visible do not trigger React updates.
 */
export function usePointerRevealTimeout(hideDelayMs: number = POINTER_REVEAL_HIDE_DELAY_MS) {
  const [visible, setVisible] = useState(false)
  const visibleRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const scheduleHide = useCallback(() => {
    clearHideTimer()
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null
      visibleRef.current = false
      setVisible(false)
    }, hideDelayMs)
  }, [clearHideTimer, hideDelayMs])

  const bumpActivity = useCallback(() => {
    if (!visibleRef.current) {
      visibleRef.current = true
      setVisible(true)
    }
    scheduleHide()
  }, [scheduleHide])

  useEffect(() => () => clearHideTimer(), [clearHideTimer])

  return { visible, bumpActivity }
}
