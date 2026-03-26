/**
 * Decode image dimensions without drawing to canvas (uses `createImageBitmap`).
 */
export async function getImageBitmapDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(blob)
  try {
    return { width: bmp.width, height: bmp.height }
  } finally {
    bmp.close()
  }
}

/**
 * Downscale an image blob so its longest edge is at most `maxEdgePx`.
 * Returns the original blob if already within bounds.
 */
export async function downscaleImageBlob(blob: Blob, maxEdgePx: number): Promise<Blob> {
  if (maxEdgePx < 1) return blob
  const bmp = await createImageBitmap(blob)
  try {
    const w = bmp.width
    const h = bmp.height
    const max = Math.max(w, h)
    if (max <= maxEdgePx) return blob
    const scale = maxEdgePx / max
    const nw = Math.max(1, Math.floor(w * scale))
    const nh = Math.max(1, Math.floor(h * scale))
    const canvas = document.createElement('canvas')
    canvas.width = nw
    canvas.height = nh
    const ctx = canvas.getContext('2d')
    if (!ctx) return blob
    ctx.drawImage(bmp, 0, 0, nw, nh)
    const mime = blob.type.startsWith('image/png') ? 'image/png' : 'image/jpeg'
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('texture downscale: toBlob failed'))),
        mime,
        mime === 'image/jpeg' ? 0.92 : undefined
      )
    })
  } finally {
    bmp.close()
  }
}
