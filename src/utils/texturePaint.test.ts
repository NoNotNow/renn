import { describe, it, expect } from 'vitest'
import { createCanvas, loadImage } from 'canvas'
import {
  clamp01,
  uvToTexelCoords,
  stampCircleOnRgba,
  applyPaintToRgbaBuffer,
} from './texturePaint'

describe('texturePaint', () => {
  describe('clamp01', () => {
    it('clamps below and above', () => {
      expect(clamp01(-1)).toBe(0)
      expect(clamp01(2)).toBe(1)
      expect(clamp01(0.5)).toBe(0.5)
    })
  })

  describe('uvToTexelCoords', () => {
    it('maps center UV to center texel on square texture', () => {
      const { x, y } = uvToTexelCoords(0.5, 0.5, 8, 8)
      expect(x).toBeGreaterThanOrEqual(3)
      expect(x).toBeLessThanOrEqual(4)
      expect(y).toBeGreaterThanOrEqual(3)
      expect(y).toBeLessThanOrEqual(4)
    })

    it('wraps UV outside 0–1', () => {
      const a = uvToTexelCoords(1.25, 0.25, 4, 4)
      const b = uvToTexelCoords(0.25, 0.25, 4, 4)
      expect(a).toEqual(b)
    })
  })

  describe('stampCircleOnRgba', () => {
    it('changes center pixel when stamping red', () => {
      const w = 16
      const h = 16
      const data = new Uint8ClampedArray(w * h * 4).fill(255)
      stampCircleOnRgba(data, w, h, 8, 8, 3, [1, 0, 0, 1])
      const i = (8 * w + 8) * 4
      expect(data[i]).toBeGreaterThan(200)
      expect(data[i + 1]).toBeLessThan(80)
      expect(data[i + 2]).toBeLessThan(80)
    })
  })

  describe('applyPaintToRgbaBuffer', () => {
    it('changes PNG bytes after encode (node canvas pipeline)', async () => {
      const c0 = createCanvas(32, 32)
      const g0 = c0.getContext('2d')
      g0.fillStyle = '#ffffff'
      g0.fillRect(0, 0, 32, 32)
      const beforeBuf = c0.toBuffer('image/png')

      const img = await loadImage(beforeBuf)
      const c1 = createCanvas(32, 32)
      const g1 = c1.getContext('2d')
      g1.drawImage(img, 0, 0)
      const id = g1.getImageData(0, 0, 32, 32)
      applyPaintToRgbaBuffer(32, 32, id.data, {
        u: 0.5,
        v: 0.5,
        radiusPx: 4,
        color: [1, 0, 0, 1],
      })
      g1.putImageData(id, 0, 0)
      const afterBuf = c1.toBuffer('image/png')

      expect(afterBuf.length).not.toBe(beforeBuf.length)
    })
  })

})
