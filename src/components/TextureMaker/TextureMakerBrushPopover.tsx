import { HexColorInput, HexColorPicker } from 'react-colorful'
import { theme } from '@/config/theme'
import AnchoredPopover from '@/components/AnchoredPopover'
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
  const pickerHex = normalizeHexForPicker(colorHex)

  return (
    <AnchoredPopover
      open={open}
      anchorRef={anchorRef}
      onClose={onClose}
      ariaLabel="Texture maker brush"
      className="brush-tool-popover"
      testId="texture-maker-brush-popover"
      zIndex={theme.zIndex.popoverElevated}
      ignoreCloseWithinSelector={textureMakerRootSelector}
      closeOnEscape={false}
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
    </AnchoredPopover>
  )
}
