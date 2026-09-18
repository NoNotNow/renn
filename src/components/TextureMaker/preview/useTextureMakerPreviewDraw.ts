import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import type { TextureDocument, TextureLayerDest } from '@/utils/textureCompositor'
import { layerDestOrDefault, blendModeToCanvasOp } from '@/utils/textureCompositor'
import type { PaintStrokeState } from './useTextureMakerPaintStroke'

export function useTextureMakerPreviewDraw(options: {
  previewCanvasRef: RefObject<HTMLCanvasElement | null>
  doc: TextureDocument
  studioAssets: Map<string, Blob>
  selectedLayerId: string | null
  placementDraft: TextureLayerDest | null
  paintStrokeRef: MutableRefObject<PaintStrokeState | null>
}) {
  const { previewCanvasRef, doc, studioAssets, selectedLayerId, placementDraft, paintStrokeRef } =
    options

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
  }, [paintStrokeRef, previewCanvasRef])

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

  return {
    drawPreviewToCanvas,
    requestPreviewDraw,
    suppressNextPreviewDrawRef,
  }
}
