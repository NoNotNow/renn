import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import { normalizeHexForPicker } from '@/utils/colorUtils'
import '@/components/BrushToolPopover.css'

const textureMakerRootSelector = '[data-texture-maker-root]'

export interface TextureMakerBrushPopoverProps {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
  colorHex: string
  onColorHexChange: (hex: string) => void
  radiusPx: number
  onRadiusPxChange: (px: number) => void
  radiusMin: number
  radiusMax: number
  brushAlpha: number
  onBrushAlphaChange: (alpha: number) => void
}

export function TextureMakerBrushPopover({
  open,
  anchorRef,
  onClose,
  colorHex,
  onColorHexChange,
  radiusPx,
  onRadiusPxChange,
  radiusMin,
  radiusMax,
  brushAlpha,
  onBrushAlphaChange,
}: TextureMakerBrushPopoverProps) {
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
      if (t instanceof Element && t.closest(textureMakerRootSelector)) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, onClose, anchorRef])

  const pickerHex = normalizeHexForPicker(colorHex)

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={panelRef}
      className="brush-tool-popover"
      role="dialog"
      aria-label="Texture maker brush"
      data-testid="texture-maker-brush-popover"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 4600,
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
        data-testid="texture-maker-brush-color-hex"
        color={pickerHex}
        onChange={(h) => onColorHexChange(normalizeHexForPicker(h))}
      />
      <label className="brush-tool-popover__size-label" htmlFor="texture-maker-brush-opacity">
        <span>Opacity</span>
        <input
          id="texture-maker-brush-opacity"
          type="range"
          className="brush-tool-popover__range"
          data-testid="texture-maker-brush-opacity"
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
      <label className="brush-tool-popover__size-label" htmlFor="texture-maker-brush-size">
        <span>Size</span>
        <input
          id="texture-maker-brush-size"
          type="range"
          className="brush-tool-popover__range"
          data-testid="texture-maker-brush-size"
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
    </div>,
    document.body,
  )
}
