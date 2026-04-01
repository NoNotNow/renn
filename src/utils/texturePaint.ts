/**
 * 2D texture painting for Builder brush tool.
 * UV (0–1) uses OpenGL-style V upward; canvas uses Y downward, so we flip V when mapping to pixels.
 */

export type TexturePaintRgba = readonly [number, number, number, number]

/** Clamp to [0, 1]. */
export function clamp01(t: number): number {
  if (t < 0) return 0
  if (t > 1) return 1
  return t
}

/**
 * Maps UV to integer texel coordinates (top-left origin, matching canvas).
 * UV outside [0,1] is wrapped (fractional part) for repeat-like stamping.
 */
export function uvToTexelCoords(u: number, v: number, width: number, height: number): { x: number; y: number } {
  const fu = u - Math.floor(u)
  const fv = v - Math.floor(v)
  const x = Math.min(width - 1, Math.max(0, Math.floor(fu * width)))
  const y = Math.min(height - 1, Math.max(0, Math.floor((1 - fv) * height)))
  return { x, y }
}

/**
 * Alpha-blended circular stamp on RGBA image data (premultiplied-style over: src over dst).
 */
export function stampCircleOnRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radiusPx: number,
  rgba: TexturePaintRgba,
): void {
  const [r, g, b, a] = rgba
  const sa = clamp01(a)
  if (sa <= 0) return
  const r0 = Math.ceil(radiusPx)
  const x0 = Math.max(0, cx - r0)
  const x1 = Math.min(width - 1, cx + r0)
  const y0 = Math.max(0, cy - r0)
  const y1 = Math.min(height - 1, cy + r0)
  const r2 = radiusPx * radiusPx

  for (let py = y0; py <= y1; py++) {
    const dy = py - cy
    for (let px = x0; px <= x1; px++) {
      const dx = px - cx
      if (dx * dx + dy * dy > r2) continue
      const i = (py * width + px) * 4
      const dr = data[i]!
      const dg = data[i + 1]!
      const db = data[i + 2]!
      const da = data[i + 3]! / 255
      const inv = 1 - sa
      const outA = sa + da * inv
      if (outA <= 0) continue
      const nr = (r * 255 * sa + dr * da * inv) / outA
      const ng = (g * 255 * sa + dg * da * inv) / outA
      const nb = (b * 255 * sa + db * da * inv) / outA
      data[i] = Math.round(nr)
      data[i + 1] = Math.round(ng)
      data[i + 2] = Math.round(nb)
      data[i + 3] = Math.round(outA * 255)
    }
  }
}

export interface PaintTextureBlobOptions {
  u: number
  v: number
  /** Brush radius in texture pixels */
  radiusPx: number
  color: TexturePaintRgba
}

/** Mutates RGBA buffer (e.g. from getImageData) in place. */
export function applyPaintToRgbaBuffer(
  width: number,
  height: number,
  data: Uint8ClampedArray,
  options: PaintTextureBlobOptions,
): void {
  const { x, y } = uvToTexelCoords(options.u, options.v, width, height)
  stampCircleOnRgba(data, width, height, x, y, options.radiusPx, options.color)
}

/**
 * Decodes an image blob, stamps a brush at UV, returns PNG blob.
 * Browser / jsdom with canvas 2D required.
 */
export async function paintTextureBlob(blob: Blob, options: PaintTextureBlobOptions): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  try {
    const w = bmp.width
    const h = bmp.height
    if (w < 1 || h < 1) {
      throw new Error('Texture image has invalid dimensions')
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    ctx.drawImage(bmp, 0, 0)
    const imageData = ctx.getImageData(0, 0, w, h)
    applyPaintToRgbaBuffer(w, h, imageData.data, options)
    ctx.putImageData(imageData, 0, 0)
    const out = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
    })
    return out
  } finally {
    if ('close' in bmp && typeof (bmp as ImageBitmap).close === 'function') {
      ;(bmp as ImageBitmap).close()
    }
  }
}
