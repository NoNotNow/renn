import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addFullscreenChangeListener,
  exitFullscreenDocument,
  getFullscreenElement,
  isFullscreenEnabled,
  requestFullscreenElement,
} from '@/utils/fullscreenApi'
import { usePointerRevealTimeout } from '@/hooks/usePointerRevealTimeout'

export interface SceneFullscreenChromeControl {
  visible: boolean
  bumpActivity: () => void
}

export interface UseSceneFullscreenArgs {
  /** Container that becomes the fullscreen element when toggled. */
  sceneRootRef: React.RefObject<HTMLElement | null>
  /** Optional override (e.g. Builder uses its outer column). */
  fullscreenTargetRef?: React.RefObject<HTMLElement | null>
  /** Notified on every fullscreen on/off transition for this target. */
  onFullscreenChange?: (active: boolean) => void
  /**
   * If supplied, the parent owns chrome-reveal state; the internal pointer
   * reveal timer is bypassed.
   */
  externalChromeControl?: SceneFullscreenChromeControl | null
}

export interface SceneFullscreenState {
  supported: boolean
  active: boolean
  toggle: () => void
  chromeVisible: boolean
  bumpChrome: () => void
  useExternalChrome: boolean
}

/**
 * Manages browser fullscreen state for a scene container, including:
 * - feature-detection (`supported`),
 * - synced `active` flag for the configured target element,
 * - a `toggle` callback (request / exit + chrome bump),
 * - chrome-reveal visibility from either an internal pointer timer or a
 *   parent-owned `externalChromeControl`.
 */
export function useSceneFullscreen({
  sceneRootRef,
  fullscreenTargetRef,
  onFullscreenChange,
  externalChromeControl,
}: UseSceneFullscreenArgs): SceneFullscreenState {
  const [supported, setSupported] = useState(false)
  const [active, setActive] = useState(false)
  const prevActiveRef = useRef(false)
  const onChangeRef = useRef(onFullscreenChange)
  onChangeRef.current = onFullscreenChange

  const internalReveal = usePointerRevealTimeout()
  const useExternalChrome = externalChromeControl != null
  const chromeVisible = externalChromeControl?.visible ?? internalReveal.visible
  const bumpChrome = externalChromeControl?.bumpActivity ?? internalReveal.bumpActivity

  const getTargetEl = useCallback((): HTMLElement | null => {
    return fullscreenTargetRef?.current ?? sceneRootRef.current
  }, [fullscreenTargetRef, sceneRootRef])

  useEffect(() => {
    setSupported(isFullscreenEnabled())
  }, [])

  useEffect(() => {
    const sync = () => {
      const el = getTargetEl()
      const isActive = el != null && getFullscreenElement() === el
      setActive(isActive)
      if (prevActiveRef.current !== isActive) {
        prevActiveRef.current = isActive
        onChangeRef.current?.(isActive)
      }
    }
    const remove = addFullscreenChangeListener(sync)
    sync()
    return remove
  }, [getTargetEl])

  const toggle = useCallback(() => {
    const el = getTargetEl()
    if (el == null) return
    bumpChrome()
    if (getFullscreenElement() === el) {
      void exitFullscreenDocument().catch(() => {})
      return
    }
    void requestFullscreenElement(el).catch(() => {})
  }, [bumpChrome, getTargetEl])

  return {
    supported,
    active,
    toggle,
    chromeVisible,
    bumpChrome,
    useExternalChrome,
  }
}
