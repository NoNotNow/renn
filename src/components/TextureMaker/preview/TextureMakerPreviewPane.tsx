import { useEffect, useRef } from 'react'
import type { Vec3 } from '@/types/world'
import type { TextureDocument, TextureLayerDest } from '@/utils/textureCompositor'
import {
  TEXTURE_BRUSH_RADIUS_MAX,
  TEXTURE_BRUSH_RADIUS_MIN,
} from '@/editor/transformGizmoController'
import type { TexturePaintStrokePayload } from '@/editor/transformGizmoController'
import { colorToHex } from '@/utils/colorUtils'
import type { TexturePaintRgba } from '@/utils/texturePaint'
import LayerTransformOverlay from '@/components/TextureMaker/LayerTransformOverlay'
import { TextureMakerBrushPopover } from '@/components/TextureMaker/TextureMakerBrushPopover'
import type { TextureMakerStudioTool } from '@/components/TextureMaker/textureMakerTypes'
import { useTextureMakerPreviewDraw } from './useTextureMakerPreviewDraw'
import { useTextureMakerViewNav } from './useTextureMakerViewNav'
import { useTextureMakerPaintStroke, type PaintStrokeState } from './useTextureMakerPaintStroke'

export interface TextureMakerPreviewPaneProps {
  entityId: string
  doc: TextureDocument
  compositePreviewUrl: string | null
  selectedLayerId: string | null
  placementDraft: TextureLayerDest | null
  onPlacementDraftChange: (dest: TextureLayerDest) => void
  onDestCommit: (dest: TextureLayerDest) => void
  studioTool: TextureMakerStudioTool
  onStudioToolChange: (tool: TextureMakerStudioTool) => void
  studioBrushPopoverOpen: boolean
  onStudioBrushPopoverOpenChange: (open: boolean) => void
  textureBrushRgb: Vec3
  textureBrushAlpha: number
  textureBrushRadiusPx: number
  onTextureBrushColorHexChange?: (hex: string) => void
  onTextureBrushAlphaChange?: (alpha: number) => void
  onTextureBrushRadiusPxChange?: (radiusPx: number) => void
  studioAssets: Map<string, Blob>
  pushUndoBeforePaintStroke: () => void
  onStudioPaintStrokeEnd: (payload: TexturePaintStrokePayload) => void | Promise<void>
  brushRgba: TexturePaintRgba
}

export function TextureMakerPreviewPane({
  entityId,
  doc,
  compositePreviewUrl,
  selectedLayerId,
  placementDraft,
  onPlacementDraftChange,
  onDestCommit,
  studioTool,
  onStudioToolChange,
  studioBrushPopoverOpen,
  onStudioBrushPopoverOpenChange,
  textureBrushRgb,
  textureBrushAlpha,
  textureBrushRadiusPx,
  onTextureBrushColorHexChange,
  onTextureBrushAlphaChange,
  onTextureBrushRadiusPxChange,
  studioAssets,
  pushUndoBeforePaintStroke,
  onStudioPaintStrokeEnd,
  brushRgba,
}: TextureMakerPreviewPaneProps) {
  const previewFrameRef = useRef<HTMLDivElement>(null)
  const previewViewportRef = useRef<HTMLDivElement>(null)
  const previewStackRef = useRef<HTMLDivElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const brushToolbarAnchorRef = useRef<HTMLButtonElement>(null)
  const paintStrokeRef = useRef<PaintStrokeState | null>(null)

  const brushControlsEnabled =
    onTextureBrushColorHexChange != null &&
    onTextureBrushAlphaChange != null &&
    onTextureBrushRadiusPxChange != null

  const transformInteractive = studioTool === 'transform'

  const { drawPreviewToCanvas, suppressNextPreviewDrawRef } = useTextureMakerPreviewDraw({
    previewCanvasRef,
    doc,
    studioAssets,
    selectedLayerId,
    placementDraft,
    paintStrokeRef,
  })

  const paint = useTextureMakerPaintStroke({
    previewCanvasRef,
    previewStackRef,
    paintStrokeRef,
    doc,
    placementDraft,
    studioTool,
    selectedLayerId,
    studioAssets,
    brushRgba,
    textureBrushRadiusPx,
    entityId,
    pushUndoBeforePaintStroke,
    onStudioPaintStrokeEnd,
    drawPreviewToCanvas,
    suppressNextPreviewDrawRef,
  })

  const viewNav = useTextureMakerViewNav({
    previewViewportRef,
    compositePreviewUrl,
  })

  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      viewNav.handleWindowPointerMove(e)
      paint.handleWindowPointerMove(e)
    }
    const onUp = (e: PointerEvent): void => {
      viewNav.handleWindowPointerUp(e)
      paint.handleWindowPointerUp(e)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [
    viewNav.handleWindowPointerMove,
    viewNav.handleWindowPointerUp,
    paint.handleWindowPointerMove,
    paint.handleWindowPointerUp,
  ])

  return (
    <div className="texture-maker-preview-wrap">
      <p className="texture-maker-preview-hint">
        Tools: Transform (move/resize placement), Hand (drag to pan), Brush / Pen (paint the selected layer).
        Wheel zooms the preview. With Brush or Pen selected, use Color and size for a floating picker (keeps the
        main builder brush in sync when wired).
        {studioTool === 'pen' ? (
          <span className="texture-maker-preview-hint__pen" data-testid="texture-maker-pen-texel-hint">
            {' '}
            Pen paints exactly one texture pixel (texel) per dab—zoom the preview in to see it.
          </span>
        ) : null}
      </p>
      <div
        className="texture-maker-preview__frame"
        ref={previewFrameRef}
        data-testid="texture-maker-preview-frame"
      >
        <div className="texture-maker-preview-tools" data-testid="texture-maker-preview-tools">
          <span title="Studio tool: transform gizmo, pan, paint with brush or pen.">Tool</span>
          {(
            [
              ['transform', 'Transform'],
              ['hand', 'Hand'],
              ['brush', 'Brush'],
              ['pen', 'Pen'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={studioTool === id ? 'active' : ''}
              data-testid={`texture-maker-tool-${id}`}
              onClick={() => onStudioToolChange(id)}
            >
              {label}
            </button>
          ))}
          {brushControlsEnabled && (studioTool === 'brush' || studioTool === 'pen') ? (
            <button
              ref={brushToolbarAnchorRef}
              type="button"
              className="texture-maker-brush-options"
              data-testid="texture-maker-brush-options"
              aria-expanded={studioBrushPopoverOpen}
              aria-haspopup="dialog"
              title="Brush color, opacity, and size"
              onClick={() => onStudioBrushPopoverOpenChange(!studioBrushPopoverOpen)}
            >
              <span
                className="texture-maker-brush-options__swatch"
                style={{ backgroundColor: colorToHex(textureBrushRgb) }}
                aria-hidden
              />
              <span className="texture-maker-brush-options__label">Color and size</span>
              <span className="texture-maker-brush-options__meta">
                {textureBrushRadiusPx}px · {Math.round(textureBrushAlpha * 100)}%
              </span>
            </button>
          ) : null}
        </div>
        {brushControlsEnabled ? (
          <TextureMakerBrushPopover
            open={studioBrushPopoverOpen && (studioTool === 'brush' || studioTool === 'pen')}
            anchorRef={brushToolbarAnchorRef}
            onClose={() => onStudioBrushPopoverOpenChange(false)}
            colorHex={colorToHex(textureBrushRgb)}
            onColorHexChange={onTextureBrushColorHexChange!}
            brushAlpha={textureBrushAlpha}
            onBrushAlphaChange={onTextureBrushAlphaChange!}
            radiusPx={textureBrushRadiusPx}
            onRadiusPxChange={onTextureBrushRadiusPxChange!}
            radiusMin={TEXTURE_BRUSH_RADIUS_MIN}
            radiusMax={TEXTURE_BRUSH_RADIUS_MAX}
          />
        ) : null}
        <div
          ref={previewViewportRef}
          className="texture-maker-preview-viewport"
          data-testid="texture-maker-preview-viewport"
          onPointerDown={(e) => viewNav.onViewportPointerDown(e, studioTool)}
          style={{
            cursor: studioTool === 'hand' ? 'grab' : 'default',
          }}
        >
          <div
            className="texture-maker-preview__viewport-inner"
            style={{
              transform: `translate(${viewNav.viewPan.x}px, ${viewNav.viewPan.y}px) scale(${viewNav.viewZoom})`,
            }}
          >
            {compositePreviewUrl ? (
              <div
                ref={previewStackRef}
                className="texture-maker-preview__stack"
                data-testid="texture-maker-preview-stack"
                onPointerDown={paint.onStackPointerDown}
                style={{
                  cursor: studioTool === 'brush' || studioTool === 'pen' ? 'crosshair' : 'default',
                }}
              >
                <canvas
                  ref={previewCanvasRef}
                  width={doc.width}
                  height={doc.height}
                  data-testid="texture-maker-preview-canvas"
                  draggable={false}
                />
                {selectedLayerId && placementDraft ? (
                  <LayerTransformOverlay
                    docWidth={doc.width}
                    docHeight={doc.height}
                    dest={placementDraft}
                    frameRef={previewStackRef}
                    interactive={transformInteractive}
                    onDestLiveChange={onPlacementDraftChange}
                    onDestCommit={onDestCommit}
                  />
                ) : null}
              </div>
            ) : (
              <span className="texture-maker-preview__empty">No preview</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
