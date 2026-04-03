import { useCallback, useEffect, useRef, useState } from 'react'
import type { BlendMode, TextureDocument, TextureLayer, TextureLayerDest } from '@/utils/textureCompositor'
import {
  TEXTURE_BLEND_MODES,
  TEXTURE_DOC_SIZE_MAX,
  TEXTURE_DOC_SIZE_MIN,
  TEXTURE_DOC_SIZE_PRESETS,
  layerDestOrDefault,
  blendModeToCanvasOp,
} from '@/utils/textureCompositor'
import type { Vec3 } from '@/types/world'
import {
  DEFAULT_TEXTURE_BRUSH_RGB,
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
import LayerTransformOverlay from '@/components/TextureMaker/LayerTransformOverlay'
import { TextureMakerBrushPopover } from '@/components/TextureMaker/TextureMakerBrushPopover'
import { colorToHex } from '@/utils/colorUtils'
import './TextureMaker.css'

const EMPTY_ASSETS: Map<string, Blob> = new Map()

export type TextureMakerStudioTool = 'transform' | 'hand' | 'brush' | 'pen'

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

const VIEW_ZOOM_MIN = 0.25
const VIEW_ZOOM_MAX = 8

type PaintStrokeState = {
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
  const previewFrameRef = useRef<HTMLDivElement>(null)
  const previewViewportRef = useRef<HTMLDivElement>(null)
  const previewStackRef = useRef<HTMLDivElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const brushToolbarAnchorRef = useRef<HTMLButtonElement>(null)

  const [customW, setCustomW] = useState(() => String(doc.width))
  const [customH, setCustomH] = useState(() => String(doc.height))
  const [placementDraft, setPlacementDraft] = useState<TextureLayerDest | null>(null)
  const [studioTool, setStudioTool] = useState<TextureMakerStudioTool>('transform')
  const [studioBrushPopoverOpen, setStudioBrushPopoverOpen] = useState(false)
  const [viewZoom, setViewZoom] = useState(1)
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 })
  const viewZoomRef = useRef(1)
  const viewPanRef = useRef({ x: 0, y: 0 })
  viewZoomRef.current = viewZoom
  viewPanRef.current = viewPan

  const [nameDraft, setNameDraft] = useState('')
  const [opacityDraft, setOpacityDraft] = useState(1)

  const [pos, setPos] = useState(() => ({
    x: Math.max(16, (typeof window !== 'undefined' ? window.innerWidth - defaultW : 800) / 2),
    y: Math.max(48, (typeof window !== 'undefined' ? window.innerHeight - defaultH : 600) / 2),
  }))
  const [size, setSize] = useState({ w: defaultW, h: defaultH })
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const resizeRef = useRef<{ sx: number; sy: number; w: number; h: number } | null>(null)

  const handPanRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startPanX: number
    startPanY: number
  } | null>(null)

  const paintStrokeRef = useRef<PaintStrokeState | null>(null)
  const paintFlushRafRef = useRef(0)

  const onHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [pos])

  const onHeaderPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    setPos({
      x: Math.max(0, e.clientX - dragRef.current.dx),
      y: Math.max(0, e.clientY - dragRef.current.dy),
    })
  }, [])

  const onHeaderPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      resizeRef.current = { sx: e.clientX, sy: e.clientY, w: size.w, h: size.h }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [size],
  )

  const onResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return
    const dw = e.clientX - resizeRef.current.sx
    const dh = e.clientY - resizeRef.current.sy
    setSize({
      w: Math.max(480, resizeRef.current.w + dw),
      h: Math.max(360, resizeRef.current.h + dh),
    })
  }, [])

  const onResizePointerUp = useCallback(() => {
    resizeRef.current = null
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
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

  const brushControlsEnabled =
    onTextureBrushColorHexChange != null &&
    onTextureBrushAlphaChange != null &&
    onTextureBrushRadiusPxChange != null

  useEffect(() => {
    setCustomW(String(doc.width))
    setCustomH(String(doc.height))
  }, [doc.width, doc.height])

  const selectedLayer = selectedLayerId ? doc.layers.find((l) => l.id === selectedLayerId) : undefined

  useEffect(() => {
    if (!selectedLayer) {
      setNameDraft('')
      return
    }
    setNameDraft(selectedLayer.name)
    setOpacityDraft(selectedLayer.opacity)
  }, [selectedLayerId, selectedLayer?.id, selectedLayer?.name, selectedLayer?.opacity])

  const layerPlacementSig = selectedLayer
    ? [
        selectedLayer.id,
        selectedLayer.dest?.x ?? '',
        selectedLayer.dest?.y ?? '',
        selectedLayer.dest?.w ?? '',
        selectedLayer.dest?.h ?? '',
      ].join(':')
    : ''
  const layersOrderSig = doc.layers.map((l) => l.id).join(',')

  useEffect(() => {
    if (!selectedLayerId) {
      setPlacementDraft(null)
      return
    }
    const layer = doc.layers.find((l) => l.id === selectedLayerId)
    if (!layer) {
      setPlacementDraft(null)
      return
    }
    setPlacementDraft(layerDestOrDefault(layer, doc))
  }, [selectedLayerId, doc.width, doc.height, layerPlacementSig, layersOrderSig])

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
  }, [compositePreviewUrl])

  const applyCustomDocSize = useCallback(() => {
    const w = Math.round(Number(customW))
    const h = Math.round(Number(customH))
    if (!Number.isFinite(w) || !Number.isFinite(h)) return
    const cw = Math.min(TEXTURE_DOC_SIZE_MAX, Math.max(TEXTURE_DOC_SIZE_MIN, w))
    const ch = Math.min(TEXTURE_DOC_SIZE_MAX, Math.max(TEXTURE_DOC_SIZE_MIN, h))
    void onResizeDocument(cw, ch)
  }, [customW, customH, onResizeDocument])

  const commitLayerDest = useCallback(
    (d: TextureLayerDest) => {
      if (!selectedLayerId) return
      void onPatchLayer(selectedLayerId, { dest: d })
    },
    [selectedLayerId, onPatchLayer],
  )

  const brushRgba: TexturePaintRgba = [
    textureBrushRgb[0],
    textureBrushRgb[1],
    textureBrushRgb[2],
    textureBrushAlpha < 0 ? 0 : textureBrushAlpha > 1 ? 1 : textureBrushAlpha,
  ]

  const docRef = useRef(doc)
  docRef.current = doc
  const studioAssetsRef = useRef(studioAssets)
  studioAssetsRef.current = studioAssets
  const selectedLayerIdRef = useRef(selectedLayerId)
  selectedLayerIdRef.current = selectedLayerId
  const placementDraftRef = useRef(placementDraft)
  placementDraftRef.current = placementDraft

  const bitmapCacheRef = useRef<Map<string, { blob: Blob; bitmap: ImageBitmap }>>(new Map())
  const previewDrawRafRef = useRef<number | null>(null)
  const previewDrawVersionRef = useRef(0)
  const suppressNextPreviewDrawRef = useRef(false)

  const drawPreviewToCanvas = useCallback(async () => {
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const curDoc = docRef.current
    if (!curDoc || curDoc.layers.length === 0) return
    const curAssets = studioAssetsRef.current

    const token = ++previewDrawVersionRef.current
    ctx.clearRect(0, 0, curDoc.width, curDoc.height)

    if (typeof createImageBitmap !== 'function') {
      // jsdom/tests: no canvas bitmap decoding available.
      return
    }

    const st = paintStrokeRef.current

    for (const layer of curDoc.layers) {
      if (previewDrawVersionRef.current !== token) return
      if (!layer.visible) continue

      const dest =
        layer.id === selectedLayerIdRef.current && placementDraftRef.current
          ? placementDraftRef.current
          : layerDestOrDefault(layer, curDoc)

      // Active stroke layer: draw synchronously from the working canvas (no decode / bitmap churn).
      if (st && st.mapAssetId === layer.assetId) {
        ctx.save()
        ctx.globalAlpha = Math.min(1, Math.max(0, layer.opacity))
        ctx.globalCompositeOperation = blendModeToCanvasOp(layer.blendMode)
        ctx.drawImage(st.workingCanvas, 0, 0, st.layerW, st.layerH, dest.x, dest.y, dest.w, dest.h)
        ctx.restore()
        continue
      }

      const blob = (curAssets && curAssets.get(layer.assetId)) ?? undefined
      if (!blob) continue

      let entry = bitmapCacheRef.current.get(layer.assetId)
      if (!entry || entry.blob !== blob) {
        if (entry?.bitmap && 'close' in entry.bitmap && typeof entry.bitmap.close === 'function') {
          try {
            entry.bitmap.close()
          } catch {
            /* ignore */
          }
        }
        const bitmap = await createImageBitmap(blob)
        bitmapCacheRef.current.set(layer.assetId, { blob, bitmap })
        entry = bitmapCacheRef.current.get(layer.assetId)!
      }

      if (previewDrawVersionRef.current !== token) return

      ctx.save()
      ctx.globalAlpha = Math.min(1, Math.max(0, layer.opacity))
      ctx.globalCompositeOperation = blendModeToCanvasOp(layer.blendMode)
      ctx.drawImage(entry.bitmap, 0, 0, entry.bitmap.width, entry.bitmap.height, dest.x, dest.y, dest.w, dest.h)
      ctx.restore()
    }
  }, [])

  const requestPreviewDraw = useCallback(() => {
    if (previewDrawRafRef.current) return
    previewDrawRafRef.current = requestAnimationFrame(() => {
      previewDrawRafRef.current = null
      void drawPreviewToCanvas()
    })
  }, [drawPreviewToCanvas])

  useEffect(() => {
    // Doc/layer/dest changes should immediately update the preview.
    if (suppressNextPreviewDrawRef.current) {
      suppressNextPreviewDrawRef.current = false
      return
    }
    requestPreviewDraw()
  }, [doc, placementDraft, selectedLayerId, studioAssets, requestPreviewDraw])

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
  }, [drawPreviewToCanvas])

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
  }, [entityId, flushPaintRaf, onStudioPaintStrokeEnd])

  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      const hp = handPanRef.current
      if (hp && e.pointerId === hp.pointerId) {
        setViewPan({
          x: hp.startPanX + (e.clientX - hp.startClientX),
          y: hp.startPanY + (e.clientY - hp.startClientY),
        })
      }
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
    }
    const onUp = (e: PointerEvent): void => {
      if (handPanRef.current && e.pointerId === handPanRef.current.pointerId) {
        handPanRef.current = null
      }
      const st = paintStrokeRef.current
      if (st && e.pointerId === st.pointerId) {
        void endPaintStroke()
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [doc.width, doc.height, placementDraft, flushPaintRaf, endPaintStroke])

  const onViewportPointerDown = useCallback(
    (e: React.PointerEvent) => {
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
    },
    [studioTool],
  )

  const onStackPointerDown = useCallback(
    async (e: React.PointerEvent) => {
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
    ],
  )

  const layersTopFirst = [...doc.layers].reverse()

  const transformInteractive = studioTool === 'transform'

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
            <div className="texture-maker-doc-size" data-testid="texture-maker-doc-size">
              <span className="texture-maker-doc-size__label">Document size</span>
              <div className="texture-maker-doc-size__presets">
                {TEXTURE_DOC_SIZE_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={doc.width === n && doc.height === n ? 'active' : ''}
                    onClick={() => void onResizeDocument(n, n)}
                    disabled={doc.width === n && doc.height === n}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="texture-maker-doc-size__custom">
                <input
                  aria-label="Custom width"
                  type="number"
                  min={TEXTURE_DOC_SIZE_MIN}
                  max={TEXTURE_DOC_SIZE_MAX}
                  value={customW}
                  onChange={(e) => setCustomW(e.target.value)}
                  onBlur={applyCustomDocSize}
                />
                <span className="texture-maker-doc-size__times">×</span>
                <input
                  aria-label="Custom height"
                  type="number"
                  min={TEXTURE_DOC_SIZE_MIN}
                  max={TEXTURE_DOC_SIZE_MAX}
                  value={customH}
                  onChange={(e) => setCustomH(e.target.value)}
                  onBlur={applyCustomDocSize}
                />
              </div>
              <span className="texture-maker-doc-size__hint">
                Current {doc.width}×{doc.height}px — resamples all layer rasters
              </span>
            </div>

            <div className="texture-maker-preview-wrap">
              <p className="texture-maker-preview-hint">
                Tools: Transform (move/resize placement), Hand (drag to pan), Brush / Pen (paint the selected layer).
                Wheel zooms the preview. With Brush or Pen selected, use Color and size for a floating picker (keeps the
                main builder brush in sync when wired).
              </p>
              <div
                className="texture-maker-preview__frame"
                ref={previewFrameRef}
                data-testid="texture-maker-preview-frame"
              >
                <div className="texture-maker-preview-tools" data-testid="texture-maker-preview-tools">
                  <span>Tool</span>
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
                      onClick={() => setStudioTool(id)}
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
                      onClick={() => setStudioBrushPopoverOpen((o) => !o)}
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
                    onClose={() => setStudioBrushPopoverOpen(false)}
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
                  onPointerDown={onViewportPointerDown}
                  style={{
                    cursor: studioTool === 'hand' ? 'grab' : 'default',
                  }}
                >
                  <div
                    className="texture-maker-preview__viewport-inner"
                    style={{
                      transform: `translate(${viewPan.x}px, ${viewPan.y}px) scale(${viewZoom})`,
                    }}
                  >
                    {compositePreviewUrl ? (
                      <div
                        ref={previewStackRef}
                        className="texture-maker-preview__stack"
                        data-testid="texture-maker-preview-stack"
                        onPointerDown={onStackPointerDown}
                        style={{
                          cursor:
                            studioTool === 'brush' || studioTool === 'pen' ? 'crosshair' : 'default',
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
                            onDestLiveChange={setPlacementDraft}
                            onDestCommit={commitLayerDest}
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
          </div>

          <div className="texture-maker-right" data-testid="texture-maker-right">
            <div className="texture-maker-layers">
              <div className="texture-maker-layers__title">Layers (top first)</div>
              {layersTopFirst.map((layer) => {
                const realIndex = doc.layers.indexOf(layer)
                const selected = layer.id === selectedLayerId
                return (
                  <div
                    key={layer.id}
                    className={`texture-maker-layer-row${selected ? ' selected' : ''}`}
                    onClick={() => onSelectLayer(layer.id)}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    aria-label={`Select layer ${layer.name} for painting`}
                    onKeyDown={(e) => e.key === 'Enter' && onSelectLayer(layer.id)}
                  >
                    <button
                      type="button"
                      title={layer.visible ? 'Hide' : 'Show'}
                      onClick={(e) => {
                        e.stopPropagation()
                        onPatchLayer(layer.id, { visible: !layer.visible })
                      }}
                      className="texture-maker-layer-row__icon"
                    >
                      {layer.visible ? '👁' : '○'}
                    </button>
                    <span className="texture-maker-layer-row__name">{layer.name}</span>
                    <button
                      type="button"
                      disabled={realIndex <= 0}
                      title="Merge down"
                      onClick={(e) => {
                        e.stopPropagation()
                        onMergeDown(realIndex)
                      }}
                      className="texture-maker-layer-row__icon"
                    >
                      ⬇
                    </button>
                    <button
                      type="button"
                      title="Remove"
                      disabled={doc.layers.length <= 1}
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveLayer(realIndex)
                      }}
                      className="texture-maker-layer-row__icon"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
              <div className="texture-maker-layers__actions">
                <button type="button" onClick={() => onAddEmptyLayer()}>
                  + Empty layer
                </button>
                <button type="button" onClick={() => importRef.current?.click()}>
                  + Import image
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept="image/*"
                  className="texture-maker-file-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onImportLayer(f)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>

            <div className="texture-maker-props" data-testid="texture-maker-layer-props">
              {selectedLayerId && selectedLayer ? (
                <div className="texture-maker-props__inner">
                  <h3 className="texture-maker-props__heading">Layer properties</h3>
                  {placementDraft ? (
                    <dl className="texture-maker-props__dest-readout" data-testid="texture-maker-dest-readout">
                      <div>
                        <dt>Placement X</dt>
                        <dd>{Math.round(placementDraft.x)}</dd>
                      </div>
                      <div>
                        <dt>Y</dt>
                        <dd>{Math.round(placementDraft.y)}</dd>
                      </div>
                      <div>
                        <dt>W</dt>
                        <dd>{Math.round(placementDraft.w)}</dd>
                      </div>
                      <div>
                        <dt>H</dt>
                        <dd>{Math.round(placementDraft.h)}</dd>
                      </div>
                    </dl>
                  ) : null}
                  <div className="texture-maker-props__quick">
                    <button
                      type="button"
                      onClick={() => {
                        onPatchLayer(selectedLayer.id, { dest: undefined })
                        setPlacementDraft({ x: 0, y: 0, w: doc.width, h: doc.height })
                      }}
                    >
                      Reset placement (full canvas)
                    </button>
                  </div>
                  <label className="texture-maker-props__label">
                    Opacity (draft)
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={opacityDraft}
                      onChange={(e) => {
                        const next = Number(e.target.value)
                        setOpacityDraft(next)
                        // Draft opacity updates preview immediately (final composite happens via Apply).
                        void onPatchLayer(selectedLayer.id, { opacity: next })
                      }}
                      aria-label="Layer opacity draft"
                      data-testid="texture-maker-opacity-draft"
                    />
                    <span>{Math.round(opacityDraft * 100)}%</span>
                  </label>
                  <label className="texture-maker-props__label">
                    Blend
                    <select
                      value={selectedLayer.blendMode}
                      onChange={(e) =>
                        onPatchLayer(selectedLayer.id, { blendMode: e.target.value as BlendMode })
                      }
                    >
                      {TEXTURE_BLEND_MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="texture-maker-props__label">
                    Name
                    <input
                      type="text"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={() => {
                        const t = nameDraft.trim()
                        if (t && t !== selectedLayer.name) {
                          onPatchLayer(selectedLayer.id, { name: t })
                        }
                      }}
                      aria-label="Layer name"
                      data-testid="texture-maker-name-draft"
                    />
                  </label>
                  <div className="texture-maker-toolbar">
                    <span>Stack</span>
                    <button
                      type="button"
                      title="Bring forward"
                      disabled={doc.layers.indexOf(selectedLayer) >= doc.layers.length - 1}
                      onClick={() => {
                        const i = doc.layers.indexOf(selectedLayer)
                        onReorderLayer(i, i + 1)
                      }}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      title="Send backward"
                      disabled={doc.layers.indexOf(selectedLayer) <= 0}
                      onClick={() => {
                        const i = doc.layers.indexOf(selectedLayer)
                        onReorderLayer(i, i - 1)
                      }}
                    >
                      Down
                    </button>
                  </div>
                </div>
              ) : (
                <p className="texture-maker-props__empty">Select a layer to edit properties</p>
              )}
            </div>
          </div>
        </div>

        <div
          className="texture-maker-resize"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
        />

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
