/**
 * Layered albedo compositor: multiple PNG layers → single composite for Three.js.
 * Sidecar JSON is stored as `texdoc_${compositeAssetId}` in the project assets map.
 */

import { generateTexLayerAssetId } from '@/utils/idGenerator'

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'difference'
  | 'soft-light'
  | 'hard-light'

export const TEXTURE_BLEND_MODES: readonly BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'difference',
  'soft-light',
  'hard-light',
] as const

/** Common square texture sizes for the document (overall compositor resolution). */
export const TEXTURE_DOC_SIZE_PRESETS = [256, 512, 1024, 2048] as const

export const TEXTURE_DOC_SIZE_MIN = 16
export const TEXTURE_DOC_SIZE_MAX = 4096

/** Where the layer raster is drawn on the document (destination rect in doc pixels). Omitted = full canvas. */
export interface TextureLayerDest {
  x: number
  y: number
  w: number
  h: number
}

const BLEND_TO_CANVAS: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  difference: 'difference',
  'soft-light': 'soft-light',
  'hard-light': 'hard-light',
}

export interface TextureLayer {
  id: string
  name: string
  assetId: string
  opacity: number
  blendMode: BlendMode
  visible: boolean
  /** Draw layer image into this rect; default full document. */
  dest?: TextureLayerDest
}

export interface TextureDocument {
  version: '1'
  compositeAssetId: string
  width: number
  height: number
  layers: TextureLayer[]
}

export function texDocAssetId(compositeAssetId: string): string {
  return `texdoc_${compositeAssetId}`
}

/** `entity.material.map` values produced by {@link generateCompositeAssetId}. */
export function isCompositeMaterialMap(assetId: string | undefined): boolean {
  return Boolean(assetId?.startsWith('composite_'))
}

export function serializeDocToBlob(doc: TextureDocument): Blob {
  return new Blob([JSON.stringify(doc)], { type: 'application/json' })
}

function sanitizeLayerDest(d: unknown): TextureLayerDest | undefined {
  if (!d || typeof d !== 'object') return undefined
  const o = d as Record<string, unknown>
  const x = Number(o.x)
  const y = Number(o.y)
  const w = Number(o.w)
  const h = Number(o.h)
  if (![x, y, w, h].every((n) => Number.isFinite(n)) || w <= 0 || h <= 0) return undefined
  return { x, y, w, h }
}

export async function deserializeDoc(blob: Blob): Promise<TextureDocument> {
  const text = await blob.text()
  const raw = JSON.parse(text) as TextureDocument
  if (raw.version !== '1' || !raw.compositeAssetId || typeof raw.width !== 'number') {
    throw new Error('Invalid TextureDocument')
  }
  const layers = (raw.layers ?? []).map((l) => {
    const { dest: rawDest, ...rest } = l as TextureLayer & { dest?: unknown }
    const dest = sanitizeLayerDest(rawDest)
    return dest ? { ...rest, dest } : (rest as TextureLayer)
  })
  return { ...raw, layers }
}

function blendToCanvasOp(mode: BlendMode): GlobalCompositeOperation {
  return BLEND_TO_CANVAS[mode] ?? 'source-over'
}

function imageSourceSize(src: CanvasImageSource): { sw: number; sh: number } {
  const w = (src as { width?: number }).width
  const h = (src as { height?: number }).height
  const sw = typeof w === 'number' && w > 0 ? w : 1
  const sh = typeof h === 'number' && h > 0 ? h : 1
  return { sw, sh }
}

export function defaultLayerDest(doc: TextureDocument): TextureLayerDest {
  return { x: 0, y: 0, w: doc.width, h: doc.height }
}

export function layerDestOrDefault(layer: TextureLayer, doc: TextureDocument): TextureLayerDest {
  const d = layer.dest
  if (
    d &&
    Number.isFinite(d.x) &&
    Number.isFinite(d.y) &&
    Number.isFinite(d.w) &&
    Number.isFinite(d.h) &&
    d.w > 0 &&
    d.h > 0
  ) {
    return d
  }
  return defaultLayerDest(doc)
}

export function scaleDestRectForDocResize(
  dest: TextureLayerDest,
  oldW: number,
  oldH: number,
  newW: number,
  newH: number,
): TextureLayerDest {
  if (oldW < 1 || oldH < 1) return dest
  return {
    x: (dest.x / oldW) * newW,
    y: (dest.y / oldH) * newH,
    w: (dest.w / oldW) * newW,
    h: (dest.h / oldH) * newH,
  }
}

/**
 * Change document dimensions: stretch each layer raster to the new size and scale custom `dest` rects.
 */
export async function resizeTextureDocument(
  doc: TextureDocument,
  newW: number,
  newH: number,
  assets: ReadonlyMap<string, Blob>,
): Promise<{ doc: TextureDocument; layerBlobs: Map<string, Blob> }> {
  const nw = Math.round(Math.min(TEXTURE_DOC_SIZE_MAX, Math.max(TEXTURE_DOC_SIZE_MIN, newW)))
  const nh = Math.round(Math.min(TEXTURE_DOC_SIZE_MAX, Math.max(TEXTURE_DOC_SIZE_MIN, newH)))
  const oldW = doc.width
  const oldH = doc.height
  if (nw === oldW && nh === oldH) {
    return { doc, layerBlobs: new Map() }
  }
  const layerBlobs = new Map<string, Blob>()
  for (const layer of doc.layers) {
    const blob = assets.get(layer.assetId)
    if (!blob) continue
    const resized = await rasterizeBlobToDimensions(blob, nw, nh)
    layerBlobs.set(layer.assetId, resized)
  }
  const layers = doc.layers.map((l) => ({
    ...l,
    dest: l.dest ? scaleDestRectForDocResize(l.dest, oldW, oldH, nw, nh) : undefined,
  }))
  return {
    doc: { ...doc, width: nw, height: nh, layers },
    layerBlobs,
  }
}

/** Browser: ImageBitmap; Node tests: `canvas` Image. */
async function blobToImageSource(blob: Blob): Promise<CanvasImageSource> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob)
  }
  const { loadImage } = await import('canvas')
  const buf = Buffer.from(await blob.arrayBuffer())
  return (await loadImage(buf)) as unknown as CanvasImageSource
}

function disposeImageSource(src: CanvasImageSource): void {
  if (
    typeof ImageBitmap !== 'undefined' &&
    src instanceof ImageBitmap &&
    typeof src.close === 'function'
  ) {
    src.close()
  }
}

type AnyCanvas = HTMLCanvasElement & { toBuffer?: (mime: string) => Buffer }

async function createWorkingCanvas(
  width: number,
  height: number,
): Promise<{ canvas: AnyCanvas; dispose: () => void }> {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas') as AnyCanvas
    canvas.width = width
    canvas.height = height
    return { canvas, dispose: () => {} }
  }
  const { createCanvas } = await import('canvas')
  const canvas = createCanvas(width, height) as unknown as AnyCanvas
  return { canvas, dispose: () => {} }
}

function canvasToPngBlob(canvas: AnyCanvas): Promise<Blob> {
  if (typeof canvas.toBlob === 'function') {
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
    })
  }
  if (typeof canvas.toBuffer === 'function') {
    const buf = canvas.toBuffer('image/png')
    return Promise.resolve(new Blob([buf], { type: 'image/png' }))
  }
  return Promise.reject(new Error('Cannot export canvas to PNG'))
}

/**
 * Bottom-to-top draw. Hidden layers skipped. Missing blobs skipped.
 */
export async function compositeTextureLayers(
  doc: TextureDocument,
  assets: ReadonlyMap<string, Blob>,
): Promise<Blob> {
  const { canvas, dispose } = await createWorkingCanvas(doc.width, doc.height)
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')

    for (const layer of doc.layers) {
      if (!layer.visible) continue
      const blob = assets.get(layer.assetId)
      if (!blob) continue
      const src = await blobToImageSource(blob)
      try {
        const { sw, sh } = imageSourceSize(src)
        const dest = layerDestOrDefault(layer, doc)
        ctx.save()
        ctx.globalAlpha = Math.min(1, Math.max(0, layer.opacity))
        ctx.globalCompositeOperation = blendToCanvasOp(layer.blendMode)
        ctx.drawImage(src, 0, 0, sw, sh, dest.x, dest.y, dest.w, dest.h)
        ctx.restore()
      } finally {
        disposeImageSource(src)
      }
    }

    return await canvasToPngBlob(canvas)
  } finally {
    dispose()
  }
}

/**
 * Creates an RGBA PNG with all pixels transparent.
 */
export async function readImageBitmapSize(blob: Blob): Promise<{ width: number; height: number }> {
  const src = await blobToImageSource(blob)
  try {
    const w = (src as { width?: number }).width ?? 0
    const h = (src as { height?: number }).height ?? 0
    if (w < 1 || h < 1) throw new Error('Invalid image dimensions')
    return { width: w, height: h }
  } finally {
    disposeImageSource(src)
  }
}

export async function createTransparentPngBlob(width: number, height: number): Promise<Blob> {
  const { canvas, dispose } = await createWorkingCanvas(width, height)
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    ctx.clearRect(0, 0, width, height)
    return await canvasToPngBlob(canvas)
  } finally {
    dispose()
  }
}

/**
 * Rasterize `imageBlob` to doc dimensions (stretch to fit).
 */
export async function rasterizeBlobToDimensions(
  imageBlob: Blob,
  width: number,
  height: number,
): Promise<Blob> {
  const { canvas, dispose } = await createWorkingCanvas(width, height)
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    const src = await blobToImageSource(imageBlob)
    try {
      ctx.drawImage(src, 0, 0, width, height)
    } finally {
      disposeImageSource(src)
    }
    return await canvasToPngBlob(canvas)
  } finally {
    dispose()
  }
}

export interface NewTextureDocumentParams {
  compositeAssetId: string
  width: number
  height: number
  backgroundLayerAssetId: string
  paintLayerAssetId: string
  backgroundName?: string
  paintLayerName?: string
}

export function buildTextureDocument(params: NewTextureDocumentParams): TextureDocument {
  const {
    compositeAssetId,
    width,
    height,
    backgroundLayerAssetId,
    paintLayerAssetId,
    backgroundName = 'Background',
    paintLayerName = 'Paint',
  } = params
  return {
    version: '1',
    compositeAssetId,
    width,
    height,
    layers: [
      {
        id: generateTexLayerAssetId(),
        name: backgroundName,
        assetId: backgroundLayerAssetId,
        opacity: 1,
        blendMode: 'normal',
        visible: true,
      },
      {
        id: generateTexLayerAssetId(),
        name: paintLayerName,
        assetId: paintLayerAssetId,
        opacity: 1,
        blendMode: 'normal',
        visible: true,
      },
    ],
  }
}

/** Remove layer at `index` (0 = bottom). Returns new doc; caller removes blobs from assets. */
export function removeLayerAt(doc: TextureDocument, index: number): TextureDocument {
  const layers = doc.layers.filter((_, i) => i !== index)
  return { ...doc, layers }
}

/** Move layer from `fromIndex` to `toIndex` (0 = bottom). */
export function reorderLayer(doc: TextureDocument, fromIndex: number, toIndex: number): TextureDocument {
  const layers = [...doc.layers]
  const [item] = layers.splice(fromIndex, 1)
  if (!item) return doc
  layers.splice(toIndex, 0, item)
  return { ...doc, layers }
}

/**
 * Merge layer at `index` onto `index - 1`. Composite of [bottom, top] becomes the new bottom raster;
 * top layer row is removed. Caller should `assets.set(bottomAssetId, mergedBlob)` and delete `removedTopAssetId`.
 */
export async function mergeLayerDown(
  doc: TextureDocument,
  index: number,
  assets: ReadonlyMap<string, Blob>,
): Promise<{
  doc: TextureDocument
  mergedBlob: Blob
  bottomAssetId: string
  removedTopAssetId: string
}> {
  if (index < 1 || index >= doc.layers.length) {
    throw new Error('mergeLayerDown: invalid index')
  }
  const bottom = doc.layers[index - 1]!
  const top = doc.layers[index]!
  const subDoc: TextureDocument = {
    ...doc,
    layers: [bottom, top],
  }
  const mergedBlob = await compositeTextureLayers(subDoc, assets)
  const newLayers = [...doc.layers]
  newLayers.splice(index, 1)
  const bottomSlot = newLayers[index - 1]
  if (bottomSlot) {
    newLayers[index - 1] = { ...bottomSlot, name: `${bottom.name} + ${top.name}` }
  }
  return {
    doc: { ...doc, layers: newLayers },
    mergedBlob,
    bottomAssetId: bottom.assetId,
    removedTopAssetId: top.assetId,
  }
}
