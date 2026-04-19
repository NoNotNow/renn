import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { usePointerRevealTimeout } from '@/hooks/usePointerRevealTimeout'
import { isFullscreenEnabled } from '@/utils/fullscreenApi'

export interface BuilderFullscreenChrome {
  /** Ref attached to the Builder column root (becomes the fullscreen target). */
  builderColumnRef: React.RefObject<HTMLDivElement | null>
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
  /** Pass to SceneView as `onFullscreenChange`. Saves drawer state on enter, restores on exit. */
  handleSceneFullscreenChange: (active: boolean) => void
}

/**
 * Owns the Builder's fullscreen + drawer chrome state:
 * - left/right drawer open flags (localStorage-persisted)
 * - fullscreen entry/exit (collapses both drawers on enter, restores on exit)
 * - pointer-driven idle reveal (auto-hide chrome after timeout)
 *
 * Pointer-move/pointer-down listeners are only attached when the browser actually
 * supports the Fullscreen API.
 */
export function useBuilderFullscreenChrome(): BuilderFullscreenChrome {
  const builderColumnRef = useRef<HTMLDivElement>(null)

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
  const { visible: fsChromeVisible, bumpActivity: bumpFsChrome } = usePointerRevealTimeout()

  useEffect(() => {
    setFullscreenApiSupported(isFullscreenEnabled())
  }, [])

  useEffect(() => {
    if (!fullscreenApiSupported) return
    const bump = () => bumpFsChrome()
    document.addEventListener('pointermove', bump, { passive: true })
    document.addEventListener('pointerdown', bump, { passive: true })
    return () => {
      document.removeEventListener('pointermove', bump)
      document.removeEventListener('pointerdown', bump)
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

  const builderChromeIdleHidden = builderFullscreenActive && !fsChromeVisible

  return {
    builderColumnRef,
    leftDrawerOpen,
    setLeftDrawerOpen,
    rightDrawerOpen,
    setRightDrawerOpen,
    builderFullscreenActive,
    fsChromeVisible,
    bumpFsChrome,
    builderChromeIdleHidden,
    handleSceneFullscreenChange,
  }
}
