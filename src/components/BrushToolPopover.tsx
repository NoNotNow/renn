import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import { BUILDER_SCENE_CANVAS_HOST_ATTR } from '@/config/constants'
import { normalizeHexForPicker } from '@/utils/colorUtils'
import './BrushToolPopover.css'

const sceneCanvasHostSelector = `[${BUILDER_SCENE_CANVAS_HOST_ATTR}]`

export interface BrushToolPopoverProps {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
  colorHex: string
  onColorHexChange: (hex: string) => void
  radiusPx: number
  onRadiusPxChange?: (px: number) => void
  radiusMin: number
  radiusMax: number
  /** Brush opacity 0–1 (alpha when painting). */
  brushAlpha?: number
  onBrushAlphaChange?: (alpha: number) => void
  /** Opens layered texture editor for the current textured selection. */
  onOpenTextureStudio?: () => void
}

export function BrushToolPopover({
  open,
  anchorRef,
  onClose,
  colorHex,
  onColorHexChange,
  radiusPx,
  onRadiusPxChange,
  radiusMin,
  radiusMax,
  brushAlpha = 1,
  onBrushAlphaChange,
  onOpenTextureStudio,
}: BrushToolPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const updatePosition = useCallback(() => {
    if (!open || !anchorRef.current) return
    const r = anchorRef.current.getBoundingClientRect()
    const margin = 10
    const panelWidth = 252
    let left = r.left
    const top = r.bottom + margin
    const vw = window.innerWidth
    if (left + panelWidth > vw - margin) left = vw - panelWidth - margin
    if (left < margin) left = margin
    setPos({ top, left })
  }, [open, anchorRef])

  useLayoutEffect(() => {
    updatePosition()
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      const t = e.target as Node
      if (anchorRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      if (t instanceof Element && t.closest(sceneCanvasHostSelector)) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, onClose, anchorRef])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const pickerHex = normalizeHexForPicker(colorHex)

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={panelRef}
      id="builder-brush-toolbar-panel"
      className="brush-tool-popover"
      role="dialog"
      aria-label="Brush options"
      data-testid="brush-tool-popover"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 4500,
        width: 252,
        padding: 14,
        boxSizing: 'border-box',
        background: '#1b1f2a',
        border: '1px solid #2f3545',
        borderRadius: 10,
        boxShadow: '0 14px 48px rgba(0, 0, 0, 0.55)',
      }}
    >
      <HexColorPicker color={pickerHex} onChange={(h) => onColorHexChange(normalizeHexForPicker(h))} />
      <HexColorInput
        prefixed
        className="brush-tool-popover__hex"
        aria-label="Brush color hex"
        title="Brush color (hex)"
        data-testid="texture-brush-color"
        color={pickerHex}
        onChange={(h) => onColorHexChange(normalizeHexForPicker(h))}
      />
      {onBrushAlphaChange ? (
        <label className="brush-tool-popover__size-label" htmlFor="builder-texture-brush-opacity">
          <span>Opacity</span>
          <input
            id="builder-texture-brush-opacity"
            type="range"
            className="brush-tool-popover__range"
            data-testid="texture-brush-opacity"
            min={0}
            max={1}
            step={0.01}
            value={brushAlpha}
            onChange={(e) => onBrushAlphaChange(Number(e.target.value))}
            aria-label="Brush opacity"
            title="Brush opacity"
          />
          <span className="brush-tool-popover__size-value">{Math.round(brushAlpha * 100)}%</span>
        </label>
      ) : null}
      {onRadiusPxChange ? (
        <label className="brush-tool-popover__size-label" htmlFor="builder-texture-brush-size">
          <span>Size</span>
          <input
            id="builder-texture-brush-size"
            type="range"
            className="brush-tool-popover__range"
            data-testid="texture-brush-size"
            min={radiusMin}
            max={radiusMax}
            step={1}
            value={radiusPx}
            onChange={(e) => onRadiusPxChange(Number(e.target.value))}
            aria-label="Brush size in texture pixels"
            title="Brush size (texture pixels)"
          />
          <span className="brush-tool-popover__size-value">{radiusPx}px</span>
        </label>
      ) : null}
      {onOpenTextureStudio ? (
        <button
          type="button"
          className="brush-tool-popover__texture-maker"
          data-testid="brush-open-texture-maker"
          onClick={() => {
            onOpenTextureStudio()
            onClose()
          }}
          style={{
            marginTop: 12,
            width: '100%',
            padding: '8px 10px',
            fontSize: 12,
            fontWeight: 600,
            background: '#2b3550',
            border: '1px solid #3d4a66',
            borderRadius: 8,
            color: '#e6e9f2',
            cursor: 'pointer',
          }}
        >
          Open texture maker
        </button>
      ) : null}
    </div>,
    document.body,
  )
}
