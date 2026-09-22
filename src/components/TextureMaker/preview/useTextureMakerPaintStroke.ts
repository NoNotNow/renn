import {
  useCallback,
  useRef,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import type { TextureDocument, TextureLayerDest } from '@/utils/textureCompositor'
import {
  TEXTURE_BRUSH_RADIUS_MAX,
  TEXTURE_BRUSH_RADIUS_MIN,
  TEXTURE_PAINT_RADIUS_PX,
  type TexturePaintStrokePayload,
} from '@/editor/transformGizmoController'
import {
  TEXTURE_PAINT_PEN_RADIUS_PX,
  decodeTextureBlobToWorkingCanvas,
  stampCircleOnWorkingCanvasTexel,
  workingCanvasToPngBlob,
  type TexturePaintRgba,
} from '@/utils/texturePaint'
import { docPointToLayerTexel, clientToDocPointFromImageRect } from '@/utils/layerTransformHandles'
import type { TextureMakerStudioTool } from '@/components/TextureMaker/textureMakerTypes'

export type PaintStrokeState = {
  pointerId: number
  mapAssetId: string
  workingCanvas: HTMLCanvasElement
  workingCtx: CanvasRenderingContext2D
  layerW: number
  layerH: number
  radiusPx: number
  color: TexturePaintRgba
  pendingTexel: { x: number; y: number } | null
}

export function useTextureMakerPaintStroke(options: {
  previewCanvasRef: RefObject<HTMLCanvasElement | null>
  previewStackRef: RefObject<HTMLDivElement | null>
  paintStrokeRef: MutableRefObject<PaintStrokeState | null>
  doc: TextureDocument
  placementDraft: TextureLayerDest | null
  studioTool: TextureMakerStudioTool
  selectedLayerId: string | null
  studioAssets: Map<string, Blob>
  brushRgba: TexturePaintRgba
  textureBrushRadiusPx: number
  entityId: string
  pushUndoBeforePaintStroke: () => void
  onStudioPaintStrokeEnd: (payload: TexturePaintStrokePayload) => void | Promise<void>
  drawPreviewToCanvas: () => void | Promise<void>
  suppressNextPreviewDrawRef: MutableRefObject<boolean>
}) {
  const {
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
  } = options

  const paintFlushRafRef = useRef(0)

  const flushPaintRaf = useCallback(() => {
    const st = paintStrokeRef.current
    if (!st?.pendingTexel) return
    const { x, y } = st.pendingTexel
    st.pendingTexel = null
    stampCircleOnWorkingCanvasTexel(st.workingCtx, st.layerW, st.layerH, {
      x,
      y,
      radiusPx: st.radiusPx,
      color: st.color,
    })
    // Live preview: redraw with the updated active layer raster.
    void drawPreviewToCanvas()
  }, [drawPreviewToCanvas, paintStrokeRef])

  const endPaintStroke = useCallback(async () => {
    if (paintFlushRafRef.current) {
      cancelAnimationFrame(paintFlushRafRef.current)
      paintFlushRafRef.current = 0
    }
    flushPaintRaf()
    const st = paintStrokeRef.current
    paintStrokeRef.current = null
    if (!st) return

    const nextBlob = await workingCanvasToPngBlob(st.workingCanvas)

    // We already rendered the final preview from the working canvas; skip the immediately-following
    // `studioAssets`-driven preview redraw to avoid an extra frame of latency.
    suppressNextPreviewDrawRef.current = true
    void onStudioPaintStrokeEnd({
      entityId,
      mapAssetId: st.mapAssetId,
      newBlob: nextBlob,
    })
  }, [entityId, flushPaintRaf, onStudioPaintStrokeEnd, paintStrokeRef, suppressNextPreviewDrawRef])

  const handleWindowPointerMove = useCallback(
    (e: PointerEvent): void => {
      const st = paintStrokeRef.current
      if (!st || e.pointerId !== st.pointerId) return
      const canvas = previewCanvasRef.current
      const stack = previewStackRef.current
      if (!canvas || !stack || !placementDraft) return
      const rect = stack.getBoundingClientRect()
      const docPt = clientToDocPointFromImageRect(e.clientX, e.clientY, rect, doc.width, doc.height)
      if (!docPt) return
      const tex = docPointToLayerTexel(docPt.x, docPt.y, placementDraft, st.layerW, st.layerH)
      if (!tex) return
      st.pendingTexel = tex
      if (!paintFlushRafRef.current) {
        paintFlushRafRef.current = requestAnimationFrame(() => {
          paintFlushRafRef.current = 0
          flushPaintRaf()
        })
      }
    },
    [doc.width, doc.height, placementDraft, flushPaintRaf, paintStrokeRef, previewCanvasRef, previewStackRef],
  )

  const handleWindowPointerUp = useCallback(
    (e: PointerEvent): void => {
      const st = paintStrokeRef.current
      if (st && e.pointerId === st.pointerId) {
        void endPaintStroke()
      }
    },
    [endPaintStroke, paintStrokeRef],
  )

  const onStackPointerDown = useCallback(
    async (e: ReactPointerEvent) => {
      if (studioTool !== 'brush' && studioTool !== 'pen') return
      if (!selectedLayerId || !placementDraft) return
      // React synthetic events may null out `currentTarget` after an async gap.
      // Capture what we need before awaiting.
      const targetEl = e.currentTarget as HTMLElement | null
      const pointerId = e.pointerId
      const layer = doc.layers.find((l) => l.id === selectedLayerId)
      if (!layer) return
      const blob = studioAssets.get(layer.assetId)
      if (!blob) return
      e.preventDefault()
      e.stopPropagation()
      const { canvas: workingCanvas, ctx: workingCtx, width: layerW, height: layerH } =
        await decodeTextureBlobToWorkingCanvas(blob)
      const canvas = previewCanvasRef.current
      const stack = previewStackRef.current
      if (!canvas || !stack) return
      const rect = stack.getBoundingClientRect()
      const docPt = clientToDocPointFromImageRect(e.clientX, e.clientY, rect, doc.width, doc.height)
      if (!docPt) return
      const tex = docPointToLayerTexel(docPt.x, docPt.y, placementDraft, layerW, layerH)
      if (!tex) return
      pushUndoBeforePaintStroke()
      const radiusPx =
        studioTool === 'pen'
          ? TEXTURE_PAINT_PEN_RADIUS_PX
          : Math.min(
              TEXTURE_BRUSH_RADIUS_MAX,
              Math.max(
                TEXTURE_BRUSH_RADIUS_MIN,
                Math.round(Number.isFinite(textureBrushRadiusPx) ? textureBrushRadiusPx : TEXTURE_PAINT_RADIUS_PX),
              ),
            )
      paintStrokeRef.current = {
        pointerId,
        mapAssetId: layer.assetId,
        workingCanvas,
        workingCtx,
        layerW,
        layerH,
        radiusPx,
        color: brushRgba,
        pendingTexel: tex,
      }
      flushPaintRaf()
      if (targetEl) {
        targetEl.setPointerCapture(pointerId)
      }
    },
    [
      studioTool,
      selectedLayerId,
      placementDraft,
      doc.layers,
      studioAssets,
      doc.width,
      doc.height,
      pushUndoBeforePaintStroke,
      textureBrushRadiusPx,
      brushRgba,
      flushPaintRaf,
      previewCanvasRef,
      previewStackRef,
      paintStrokeRef,
    ],
  )

  return {
    onStackPointerDown,
    handleWindowPointerMove,
    handleWindowPointerUp,
  }
}
