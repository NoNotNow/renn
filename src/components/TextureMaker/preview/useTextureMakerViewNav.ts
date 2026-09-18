import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { TextureMakerStudioTool } from '@/components/TextureMaker/textureMakerTypes'

const VIEW_ZOOM_MIN = 0.25
const VIEW_ZOOM_MAX = 8

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

  useEffect(() => {
    const el = previewViewportRef.current
    if (!el || !compositePreviewUrl) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const fr = el.getBoundingClientRect()
      const fx = e.clientX - fr.left
      const fy = e.clientY - fr.top
      const z0 = viewZoomRef.current
      const p0 = viewPanRef.current
      const factor = e.deltaY > 0 ? 0.92 : 1.08
      const z1 = Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, z0 * factor))
      if (Math.abs(z1 - z0) < 1e-6) return
      const p1 = {
        x: fx - (fx - p0.x) * (z1 / z0),
        y: fy - (fy - p0.y) * (z1 / z0),
      }
      setViewZoom(z1)
      setViewPan(p1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [compositePreviewUrl, previewViewportRef])

  const onViewportPointerDown = useCallback((e: React.PointerEvent, studioTool: TextureMakerStudioTool) => {
    if (studioTool !== 'hand') return
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
