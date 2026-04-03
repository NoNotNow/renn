import type { TextureLayerDest } from '@/utils/textureCompositor'

/** Interactive handles on the layer bounds overlay (non-destructive: only `dest` changes). */
export type TransformHandle =
  | 'move'
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'

const MIN_W = 1
const MIN_H = 1

export function clampDest(d: TextureLayerDest): TextureLayerDest {
  return {
    x: d.x,
    y: d.y,
    w: Math.max(MIN_W, d.w),
    h: Math.max(MIN_H, d.h),
  }
}

/**
 * Apply a drag delta in **document pixel** space to `start` for the given handle.
 * Source pixels are unchanged; only placement (`dest`) updates.
 */
export function transformDestWithDrag(
  handle: TransformHandle,
  start: TextureLayerDest,
  dxDoc: number,
  dyDoc: number,
): TextureLayerDest {
  const { x, y, w, h } = start
  if (handle === 'move') {
    return { x: x + dxDoc, y: y + dyDoc, w, h }
  }

  switch (handle) {
    case 'e':
      return clampDest({ x, y, w: w + dxDoc, h })
    case 'w':
      return clampDest({ x: x + dxDoc, y, w: w - dxDoc, h })
    case 's':
      return clampDest({ x, y, w, h: h + dyDoc })
    case 'n':
      return clampDest({ x, y: y + dyDoc, w, h: h - dyDoc })
    case 'se':
      return clampDest({ x, y, w: w + dxDoc, h: h + dyDoc })
    case 'nw':
      return clampDest({ x: x + dxDoc, y: y + dyDoc, w: w - dxDoc, h: h - dyDoc })
    case 'ne':
      return clampDest({ x, y: y + dyDoc, w: w + dxDoc, h: h - dyDoc })
    case 'sw':
      return clampDest({ x: x + dxDoc, y, w: w - dxDoc, h: h + dyDoc })
    default:
      return start
  }
}

/** Map pointer position inside the preview frame (same size as displayed composite) to document coords. */
export function clientToDocPoint(
  clientX: number,
  clientY: number,
  frameRect: DOMRectReadOnly,
  docWidth: number,
  docHeight: number,
): { x: number; y: number } {
  const lx = clientX - frameRect.left
  const ly = clientY - frameRect.top
  const u = frameRect.width > 0 ? lx / frameRect.width : 0
  const v = frameRect.height > 0 ? ly / frameRect.height : 0
  return {
    x: u * docWidth,
    y: v * docHeight,
  }
}

/**
 * Map pointer to document pixels using the displayed image element rect (handles letterboxing and CSS transforms).
 * Returns null if the point is outside the image bounds.
 */
export function clientToDocPointFromImageRect(
  clientX: number,
  clientY: number,
  imageRect: DOMRectReadOnly,
  docWidth: number,
  docHeight: number,
): { x: number; y: number } | null {
  if (imageRect.width <= 0 || imageRect.height <= 0) return null
  const lx = clientX - imageRect.left
  const ly = clientY - imageRect.top
  if (lx < 0 || ly < 0 || lx > imageRect.width || ly > imageRect.height) return null
  return {
    x: (lx / imageRect.width) * docWidth,
    y: (ly / imageRect.height) * docHeight,
  }
}

/** Map a document-space point into layer bitmap texels using layer placement rect. */
export function docPointToLayerTexel(
  docX: number,
  docY: number,
  dest: TextureLayerDest,
  layerPixelWidth: number,
  layerPixelHeight: number,
): { x: number; y: number } | null {
  if (dest.w <= 0 || dest.h <= 0 || layerPixelWidth < 1 || layerPixelHeight < 1) return null
  if (docX < dest.x || docY < dest.y || docX >= dest.x + dest.w || docY >= dest.y + dest.h) return null
  const u = (docX - dest.x) / dest.w
  const v = (docY - dest.y) / dest.h
  return {
    x: Math.min(layerPixelWidth - 1, Math.max(0, Math.floor(u * layerPixelWidth))),
    y: Math.min(layerPixelHeight - 1, Math.max(0, Math.floor(v * layerPixelHeight))),
  }
}

export function roundDest(d: TextureLayerDest): TextureLayerDest {
  return {
    x: Math.round(d.x),
    y: Math.round(d.y),
    w: Math.max(MIN_W, Math.round(d.w)),
    h: Math.max(MIN_H, Math.round(d.h)),
  }
}
