import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downscaleImageBlob, getImageBitmapDimensions } from './textureDownscale'

describe('textureDownscale', () => {
  it('returns the same blob when maxEdgePx is below 1', async () => {
    const blob = new Blob(['x'], { type: 'image/png' })
    const out = await downscaleImageBlob(blob, 0)
    expect(out).toBe(blob)
  })
})

describe('getImageBitmapDimensions', () => {
  const close = vi.fn()

  beforeEach(() => {
    close.mockClear()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({
        width: 640,
        height: 480,
        close,
      }))
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns width/height and closes the bitmap', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    const d = await getImageBitmapDimensions(blob)
    expect(d).toEqual({ width: 640, height: 480 })
    expect(close).toHaveBeenCalledTimes(1)
  })
})
