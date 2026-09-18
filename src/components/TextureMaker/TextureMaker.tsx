import { useCallback, useEffect, useRef, useState } from 'react'
import { clampDrawerPosition } from '@/components/workspace/floatingDrawerLayout'
import { useCornerBrResize } from '@/hooks/useCornerBrResize'
import { isKeyboardEventInEditableContext } from '@/input/rawInput'
import type { TextureDocument, TextureLayer } from '@/utils/textureCompositor'
import type { Vec3 } from '@/types/world'
import {
  DEFAULT_TEXTURE_BRUSH_RGB,
  TEXTURE_PAINT_RADIUS_PX,
  type TexturePaintStrokePayload,
} from '@/editor/transformGizmoController'
import type { TexturePaintRgba } from '@/utils/texturePaint'
import { TextureMakerDocSizeControls } from '@/components/TextureMaker/layers/TextureMakerDocSizeControls'
import { TextureMakerLayersPanel } from '@/components/TextureMaker/layers/TextureMakerLayersPanel'
import { useTextureMakerLayerDrafts } from '@/components/TextureMaker/layers/useTextureMakerLayerDrafts'
import { TextureMakerPreviewPane } from '@/components/TextureMaker/preview/TextureMakerPreviewPane'
import './TextureMaker.css'

const EMPTY_ASSETS: Map<string, Blob> = new Map()

import type { TextureMakerStudioTool } from '@/components/TextureMaker/textureMakerTypes'
export type { TextureMakerStudioTool } from '@/components/TextureMaker/textureMakerTypes'

export interface TextureMakerProps {
  entityId: string
  doc: TextureDocument
  compositePreviewUrl: string | null
  selectedLayerId: string | null
  onClose: () => void
  onSelectLayer: (layerId: string) => void
  onPatchLayer: (
    layerId: string,
    patch: Partial<Pick<TextureLayer, 'opacity' | 'blendMode' | 'visible' | 'name' | 'dest'>>,
  ) => void
  onReorderLayer: (fromIndex: number, toIndex: number) => void
  onRemoveLayer: (index: number) => void
  onAddEmptyLayer: () => void
  onImportLayer: (file: File) => void
  onMergeDown: (index: number) => void
  onResizeDocument: (width: number, height: number) => void | Promise<void>
  /** Final action: compose draft + apply to entity (currently wired by Builder). */
  onApplyTextureMaker: () => void | Promise<void>
  /** Same brush as 3D paint (studio brush tool). */
  textureBrushRgb?: Vec3
  textureBrushAlpha?: number
  textureBrushRadiusPx?: number
  /** When all three are set, Brush/Pen show a floating color, opacity, and size popover. */
  onTextureBrushColorHexChange?: (hex: string) => void
  onTextureBrushAlphaChange?: (alpha: number) => void
  onTextureBrushRadiusPxChange?: (radiusPx: number) => void
  /** Current asset blobs (read layer rasters for painting). */
  studioAssets?: Map<string, Blob>
  pushUndoBeforePaintStroke?: () => void
  onStudioPaintStrokeEnd?: (payload: TexturePaintStrokePayload) => void | Promise<void>
  /** Restore document + all layer rasters to state when Texture Maker was opened (this session). */
  revertToOriginalAvailable?: boolean
  onRevertToOriginal?: () => void | Promise<void>
}

const defaultW = Math.min(typeof window !== 'undefined' ? window.innerWidth * 0.85 : 900, 960)
const defaultH = Math.min(typeof window !== 'undefined' ? window.innerHeight * 0.78 : 700, 720)

export default function TextureMaker({
  entityId,
  doc,
  compositePreviewUrl,
  selectedLayerId,
  onClose,
  onSelectLayer,
  onPatchLayer,
  onReorderLayer,
  onRemoveLayer,
  onAddEmptyLayer,
  onImportLayer,
  onMergeDown,
  onResizeDocument,
  onApplyTextureMaker,
  textureBrushRgb = DEFAULT_TEXTURE_BRUSH_RGB,
  textureBrushAlpha = 1,
  textureBrushRadiusPx = TEXTURE_PAINT_RADIUS_PX,
  onTextureBrushColorHexChange,
  onTextureBrushAlphaChange,
  onTextureBrushRadiusPxChange,
  studioAssets = EMPTY_ASSETS,
  pushUndoBeforePaintStroke = () => {},
  onStudioPaintStrokeEnd = async () => {},
  revertToOriginalAvailable = false,
  onRevertToOriginal,
}: TextureMakerProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const [studioTool, setStudioTool] = useState<TextureMakerStudioTool>('transform')
  const [studioBrushPopoverOpen, setStudioBrushPopoverOpen] = useState(false)

  const [pos, setPos] = useState(() => ({
    x: Math.max(16, (typeof window !== 'undefined' ? window.innerWidth - defaultW : 800) / 2),
    y: Math.max(48, (typeof window !== 'undefined' ? window.innerHeight - defaultH : 600) / 2),
  }))
  const [size, setSize] = useState({ w: defaultW, h: defaultH })
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  const {
    selectedLayer,
    nameDraft,
    setNameDraft,
    opacityDraft,
    setOpacityDraft,
    placementDraft,
    setPlacementDraft,
    commitLayerDest,
  } = useTextureMakerLayerDrafts({ doc, selectedLayerId, onPatchLayer })

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return
      e.preventDefault()
      dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [pos],
  )

  const onHeaderPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return
      setPos(
        clampDrawerPosition(
          { x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy },
          { width: size.w, height: size.h },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      )
    },
    [size.h, size.w],
  )

  const onHeaderPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const textureMakerResizeHandleProps = useCornerBrResize({
    enabled: true,
    minWidth: 480,
    minHeight: 360,
    size: { width: size.w, height: size.h },
    onSizeChange: ({ width, height }) => setSize({ w: width, h: height }),
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isKeyboardEventInEditableContext(e)) return
      if (e.key !== 'Escape') return
      if (studioBrushPopoverOpen) {
        e.preventDefault()
        setStudioBrushPopoverOpen(false)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, studioBrushPopoverOpen])

  useEffect(() => {
    if (studioTool !== 'brush' && studioTool !== 'pen') setStudioBrushPopoverOpen(false)
  }, [studioTool])

  const brushRgba: TexturePaintRgba = [
    textureBrushRgb[0],
    textureBrushRgb[1],
    textureBrushRgb[2],
    textureBrushAlpha < 0 ? 0 : textureBrushAlpha > 1 ? 1 : textureBrushAlpha,
  ]

  return (
    <div className="texture-maker-overlay" data-texture-maker-root>
      <div
        ref={panelRef}
        className="texture-maker-panel"
        role="dialog"
        aria-label="Texture maker"
        data-testid="texture-maker-panel"
        style={{
          left: pos.x,
          top: pos.y,
          width: size.w,
          height: size.h,
        }}
      >
        <div
          className="texture-maker-header"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e6e9f2' }}>
            Texture maker — {entityId.slice(0, 12)}…
          </span>
          <div className="texture-maker-header__actions">
            {onRevertToOriginal ? (
              <button
                type="button"
                className="texture-maker-header__btn texture-maker-header__btn--secondary"
                data-testid="texture-maker-revert-original"
                disabled={!revertToOriginalAvailable}
                title="Restore all layers and document settings to when you opened Texture Maker"
                aria-label="Revert all textures to original"
                onClick={(e) => {
                  e.stopPropagation()
                  void onRevertToOriginal()
                }}
              >
                Revert to original
              </button>
            ) : null}
            <button
              type="button"
              className="texture-maker-header__btn"
              onClick={onClose}
              aria-label="Close texture maker"
            >
              Close
            </button>
          </div>
        </div>

        <div className="texture-maker-body">
          <div className="texture-maker-left" data-testid="texture-maker-left">
            <TextureMakerDocSizeControls doc={doc} onResizeDocument={onResizeDocument} />
            <TextureMakerPreviewPane
              entityId={entityId}
              doc={doc}
              compositePreviewUrl={compositePreviewUrl}
              selectedLayerId={selectedLayerId}
              placementDraft={placementDraft}
              onPlacementDraftChange={setPlacementDraft}
              onDestCommit={commitLayerDest}
              studioTool={studioTool}
              onStudioToolChange={setStudioTool}
              studioBrushPopoverOpen={studioBrushPopoverOpen}
              onStudioBrushPopoverOpenChange={setStudioBrushPopoverOpen}
              textureBrushRgb={textureBrushRgb}
              textureBrushAlpha={textureBrushAlpha}
              textureBrushRadiusPx={textureBrushRadiusPx}
              onTextureBrushColorHexChange={onTextureBrushColorHexChange}
              onTextureBrushAlphaChange={onTextureBrushAlphaChange}
              onTextureBrushRadiusPxChange={onTextureBrushRadiusPxChange}
              studioAssets={studioAssets}
              pushUndoBeforePaintStroke={pushUndoBeforePaintStroke}
              onStudioPaintStrokeEnd={onStudioPaintStrokeEnd}
              brushRgba={brushRgba}
            />
          </div>

          <TextureMakerLayersPanel
            doc={doc}
            selectedLayerId={selectedLayerId}
            selectedLayer={selectedLayer}
            placementDraft={placementDraft}
            setPlacementDraft={setPlacementDraft}
            nameDraft={nameDraft}
            setNameDraft={setNameDraft}
            opacityDraft={opacityDraft}
            setOpacityDraft={setOpacityDraft}
            onSelectLayer={onSelectLayer}
            onPatchLayer={onPatchLayer}
            onReorderLayer={onReorderLayer}
            onRemoveLayer={onRemoveLayer}
            onAddEmptyLayer={onAddEmptyLayer}
            onImportLayer={onImportLayer}
            onMergeDown={onMergeDown}
          />
        </div>

        <div className="texture-maker-resize" {...textureMakerResizeHandleProps} />

        <button
          type="button"
          className="texture-maker-apply-final"
          data-testid="texture-maker-apply-final"
          onClick={() => void onApplyTextureMaker()}
        >
          Apply
        </button>
      </div>
    </div>
  )
}
