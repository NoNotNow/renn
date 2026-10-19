import { TouchCameraGestureRecognizer } from '@/input/touchCameraGestures'
import { WHEEL_NOTCH_PX, normalizeWheelDeltaPx } from '@/input/wheelGesture'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import type { TextureMakerStudioTool } from '@/components/TextureMaker/textureMakerTypes'

const VIEW_ZOOM_MIN = 0.25
const VIEW_ZOOM_MAX = 8
/** ln(zoom ratio) per normalised wheel pixel: a 100 px mouse notch ≈ 8 %. */
const TEXTURE_VIEW_ZOOM_LOG_PER_PX = 0.0008

export function useTextureMakerViewNav(options: {
  previewViewportRef: RefObject<HTMLDivElement | null>
  compositePreviewUrl: string | null
}) {
  const { previewViewportRef, compositePreviewUrl } = options

  const [viewZoom, setViewZoom] = useState(1)
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 })
  const viewZoomRef = useRef(1)
  const viewPanRef = useRef({ x: 0, y: 0 })
  viewZoomRef.current = viewZoom
  viewPanRef.current = viewPan

  const handPanRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startPanX: number
    startPanY: number
  } | null>(null)
  /** True while a two-finger touch pinch is active (suppresses hand panning). */
  const pinchActiveRef = useRef(false)

  /** Zoom by `factor` keeping the viewport point (fx, fy) visually fixed. */
  const zoomAtPoint = useCallback((fx: number, fy: number, factor: number): void => {
    const z0 = viewZoomRef.current
    const p0 = viewPanRef.current
    const z1 = Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, z0 * factor))
    if (Math.abs(z1 - z0) < 1e-6) return
    const p1 = {
      x: fx - (fx - p0.x) * (z1 / z0),
      y: fy - (fy - p0.y) * (z1 / z0),
    }
    setViewZoom(z1)
    setViewPan(p1)
  }, [])

  useEffect(() => {
    const el = previewViewportRef.current
    if (!el || !compositePreviewUrl) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const fr = el.getBoundingClientRect()
      const fx = e.clientX - fr.left
      const fy = e.clientY - fr.top
      // proportional to the normalised delta (a mouse notch = 8 %), so trackpad scroll streams no longer zoom 8 % per event
      const px = normalizeWheelDeltaPx(e.deltaY, e.deltaMode, el.clientHeight)
      const clamped = Math.max(-WHEEL_NOTCH_PX, Math.min(WHEEL_NOTCH_PX, px))
      zoomAtPoint(fx, fy, Math.exp(-clamped * TEXTURE_VIEW_ZOOM_LOG_PER_PX))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [compositePreviewUrl, previewViewportRef, zoomAtPoint])

  // Two-finger touch pinch zoom, reusing the shared touch recognizer. Mouse/pen are
  // ignored; wheel zoom is unchanged.
  useEffect(() => {
    const el = previewViewportRef.current
    if (!el || !compositePreviewUrl) return
    const recognizer = new TouchCameraGestureRecognizer()

    const onPointerDown = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch') return
      const kind = recognizer.pointerDown(e.pointerId, e.clientX, e.clientY)
      if (kind === 'pinch') {
        pinchActiveRef.current = true
        // A second finger ends an in-progress hand pan (the pinch owns the gesture).
        handPanRef.current = null
      }
    }

    const onPointerMove = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch') return
      const frame = recognizer.pointerMove(e.pointerId, e.clientX, e.clientY)
      if (frame.kind !== 'pinch' || frame.pinchPx === 0) return
      const mid = recognizer.pinchMidpoint()
      if (!mid) return
      const rect = el.getBoundingClientRect()
      // Fingers apart = zoom in (mirror of wheel-up = zoom in).
      const clamped = Math.max(-WHEEL_NOTCH_PX, Math.min(WHEEL_NOTCH_PX, -frame.pinchPx))
      zoomAtPoint(mid.x - rect.left, mid.y - rect.top, Math.exp(-clamped * TEXTURE_VIEW_ZOOM_LOG_PER_PX))
    }

    const onPointerEnd = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch') return
      recognizer.pointerEnd(e.pointerId)
      pinchActiveRef.current = recognizer.pinchMidpoint() != null
    }

    el.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerEnd)
    window.addEventListener('pointercancel', onPointerEnd)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerEnd)
      window.removeEventListener('pointercancel', onPointerEnd)
    }
  }, [compositePreviewUrl, previewViewportRef, zoomAtPoint])

  const onViewportPointerDown = useCallback((e: ReactPointerEvent, studioTool: TextureMakerStudioTool) => {
    if (studioTool !== 'hand') return
    if (pinchActiveRef.current) return
    e.preventDefault()
    const p = viewPanRef.current
    handPanRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: p.x,
      startPanY: p.y,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const handleWindowPointerMove = useCallback((e: PointerEvent): void => {
    const hp = handPanRef.current
    if (hp && e.pointerId === hp.pointerId) {
      setViewPan({
        x: hp.startPanX + (e.clientX - hp.startClientX),
        y: hp.startPanY + (e.clientY - hp.startClientY),
      })
    }
  }, [])

  const handleWindowPointerUp = useCallback((e: PointerEvent): void => {
    if (handPanRef.current && e.pointerId === handPanRef.current.pointerId) {
      handPanRef.current = null
    }
  }, [])

  return {
    viewZoom,
    viewPan,
    onViewportPointerDown,
    handleWindowPointerMove,
    handleWindowPointerUp,
  }
}
