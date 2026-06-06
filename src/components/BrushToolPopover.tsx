import { HexColorInput, HexColorPicker } from 'react-colorful'
import { BUILDER_SCENE_CANVAS_HOST_ATTR } from '@/config/constants'
import { theme } from '@/config/theme'
import AnchoredPopover from '@/components/AnchoredPopover'
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
  const pickerHex = normalizeHexForPicker(colorHex)

  return (
    <AnchoredPopover
      open={open}
      anchorRef={anchorRef}
      onClose={onClose}
      ariaLabel="Brush options"
      id="builder-brush-toolbar-panel"
      className="brush-tool-popover"
      testId="brush-tool-popover"
      zIndex={theme.zIndex.popover}
      ignoreCloseWithinSelector={sceneCanvasHostSelector}
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
      {onBrushAlphaChange ?
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
      : null}
      {onRadiusPxChange ?
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
      : null}
      {onOpenTextureStudio ?
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
            background: theme.button.primary,
            border: `1px solid ${theme.button.primaryBorder}`,
            borderRadius: 8,
            color: theme.text.primary,
            cursor: 'pointer',
          }}
        >
          Open texture maker
        </button>
      : null}
    </AnchoredPopover>
  )
}
