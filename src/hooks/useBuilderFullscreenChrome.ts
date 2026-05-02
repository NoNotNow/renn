import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { usePointerRevealTimeout } from '@/hooks/usePointerRevealTimeout'
import { isFullscreenEnabled } from '@/utils/fullscreenApi'

export interface BuilderFullscreenChrome {
  /** Ref attached to the Builder column root (becomes the fullscreen target). */
  builderColumnRef: React.RefObject<HTMLDivElement>
  /**
   * Attach to the full-area sidebars overlay wrapper (`position: absolute; inset: 0; pointer-events: none`).
   * Used to detect when the pointer is over sidebar UI so idle fullscreen auto-hide is suppressed.
   */
  fsSidebarsHitTestRef: React.MutableRefObject<HTMLDivElement | null>
  /** Left sidebar drawer open state (persisted to localStorage). */
  leftDrawerOpen: boolean
  setLeftDrawerOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  /** Right sidebar drawer open state (persisted to localStorage). */
  rightDrawerOpen: boolean
  setRightDrawerOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  /** True while the SceneView is in fullscreen. */
  builderFullscreenActive: boolean
  /** Visible flag of the auto-hide chrome reveal (pointer activity within timeout). */
  fsChromeVisible: boolean
  /** Bump pointer activity (re-shows chrome and resets the auto-hide timer). */
  bumpFsChrome: () => void
  /** True when chrome should be hidden in idle fullscreen. */
  builderChromeIdleHidden: boolean
  /** Scene fullscreen button visibility in Builder (includes sidebar hover pin). */
  fsChromeControlVisible: boolean
  /** Pass to SceneView as `onFullscreenChange`. Saves drawer state on enter, restores on exit. */
  handleSceneFullscreenChange: (active: boolean) => void
}

/**
 * Owns the Builder's fullscreen + drawer chrome state:
 * - left/right drawer open flags (localStorage-persisted)
 * - fullscreen entry/exit (collapses both drawers on enter, restores on exit)
 * - pointer-driven idle reveal (auto-hide chrome after timeout; pinned while pointer is over sidebars)
 *
 * Pointer-move/pointer-down listeners are only attached when the browser actually
 * supports the Fullscreen API.
 */
export function useBuilderFullscreenChrome(): BuilderFullscreenChrome {
  const builderColumnRef = useRef<HTMLDivElement>(null)
  const fsSidebarsHitTestRef = useRef<HTMLDivElement>(null)
  const builderFullscreenActiveRef = useRef(false)
  const pointerOverFsSidebarsRef = useRef(false)

  const [leftDrawerOpen, setLeftDrawerOpen] = useLocalStorageState('leftDrawerOpen', true)
  const [rightDrawerOpen, setRightDrawerOpen] = useLocalStorageState('rightDrawerOpen', true)
  const leftDrawerOpenRef = useRef(leftDrawerOpen)
  const rightDrawerOpenRef = useRef(rightDrawerOpen)
  useEffect(() => {
    leftDrawerOpenRef.current = leftDrawerOpen
  }, [leftDrawerOpen])
  useEffect(() => {
    rightDrawerOpenRef.current = rightDrawerOpen
  }, [rightDrawerOpen])

  const drawersBeforeFullscreenRef = useRef<{ left: boolean; right: boolean } | null>(null)

  const [fullscreenApiSupported, setFullscreenApiSupported] = useState(false)
  const [builderFullscreenActive, setBuilderFullscreenActive] = useState(false)
  const [pointerOverFsSidebars, setPointerOverFsSidebars] = useState(false)
  const { visible: fsChromeVisible, bumpActivity: bumpFsChrome } = usePointerRevealTimeout()

  useEffect(() => {
    builderFullscreenActiveRef.current = builderFullscreenActive
    if (!builderFullscreenActive) {
      pointerOverFsSidebarsRef.current = false
      setPointerOverFsSidebars(false)
    }
  }, [builderFullscreenActive])

  useEffect(() => {
    setFullscreenApiSupported(isFullscreenEnabled())
  }, [])

  useEffect(() => {
    if (!fullscreenApiSupported) return
    const onPointer = (e: PointerEvent) => {
      bumpFsChrome()
      if (!builderFullscreenActiveRef.current) return
      const root = fsSidebarsHitTestRef.current
      if (root == null) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const over = el != null && root.contains(el)
      if (pointerOverFsSidebarsRef.current !== over) {
        pointerOverFsSidebarsRef.current = over
        setPointerOverFsSidebars(over)
      }
    }
    document.addEventListener('pointermove', onPointer, { passive: true })
    document.addEventListener('pointerdown', onPointer, { passive: true })
    return () => {
      document.removeEventListener('pointermove', onPointer)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [fullscreenApiSupported, bumpFsChrome])

  const handleSceneFullscreenChange = useCallback(
    (active: boolean) => {
      setBuilderFullscreenActive(active)
      if (active) {
        drawersBeforeFullscreenRef.current = {
          left: leftDrawerOpenRef.current,
          right: rightDrawerOpenRef.current,
        }
        setLeftDrawerOpen(false)
        setRightDrawerOpen(false)
        return
      }
      const snap = drawersBeforeFullscreenRef.current
      if (snap != null) {
        setLeftDrawerOpen(snap.left)
        setRightDrawerOpen(snap.right)
        drawersBeforeFullscreenRef.current = null
      }
    },
    [setLeftDrawerOpen, setRightDrawerOpen],
  )

  const builderChromeIdleHidden =
    builderFullscreenActive && !fsChromeVisible && !pointerOverFsSidebars
  const fsChromeControlVisible = fsChromeVisible || (builderFullscreenActive && pointerOverFsSidebars)

  return {
    builderColumnRef,
    fsSidebarsHitTestRef,
    leftDrawerOpen,
    setLeftDrawerOpen,
    rightDrawerOpen,
    setRightDrawerOpen,
    builderFullscreenActive,
    fsChromeVisible,
    bumpFsChrome,
    builderChromeIdleHidden,
    fsChromeControlVisible,
    handleSceneFullscreenChange,
  }
}
