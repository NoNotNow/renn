/**
 * Integration: texture paint pipeline + IndexedDB overwrite + asset resolver invalidation.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createCanvas, loadImage } from 'canvas'
import { createIndexedDbPersistence } from '@/persistence/indexedDb'
import { applyPaintToRgbaBuffer } from '@/utils/texturePaint'
import { createAssetResolver } from '@/loader/assetResolverImpl'
import { resolvePaintStrokeWriteTarget } from '@/utils/paintAssetRouting'

const TEX_ID = 'tex_paint_integration'

async function whitePngBuffer(): Promise<Buffer> {
  const c = createCanvas(16, 16)
  const g = c.getContext('2d')
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 16, 16)
  return c.toBuffer('image/png')
}

async function paintedPngBuffer(): Promise<Buffer> {
  const buf = await whitePngBuffer()
  const img = await loadImage(buf)
  const c = createCanvas(16, 16)
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  const id = g.getImageData(0, 0, 16, 16)
  applyPaintToRgbaBuffer(16, 16, id.data, {
    u: 0.5,
    v: 0.5,
    radiusPx: 3,
    color: [1, 0, 0, 1],
  })
  g.putImageData(id, 0, 0)
  return c.toBuffer('image/png')
}

describe('texture brush (integration)', () => {
  describe('IndexedDB saveAsset overwrite', () => {
    let persistence: ReturnType<typeof createIndexedDbPersistence>

    beforeEach(() => {
      persistence = createIndexedDbPersistence()
    })

    it('second saveAsset with same id returns updated blob from loadAllAssets', async () => {
      const before = await whitePngBuffer()
      const after = await paintedPngBuffer()
      expect(after.length).not.toBe(before.length)

      await persistence.saveAsset(TEX_ID, new Blob([before], { type: 'image/png' }))
      const mid = await persistence.loadAllAssets()
      expect(mid.get(TEX_ID)?.size).toBe(before.length)

      await persistence.saveAsset(TEX_ID, new Blob([after], { type: 'image/png' }))
      const final = await persistence.loadAllAssets()
      const loaded = final.get(TEX_ID)
      expect(loaded).toBeDefined()
      expect(loaded!.size).toBe(after.length)
    })
  })

  describe('createAssetResolver blob replacement', () => {
    it('resolve URL changes when map is updated with new Blob same id', async () => {
      const before = await whitePngBuffer()
      const after = await paintedPngBuffer()
      const assets = new Map<string, Blob>([[TEX_ID, new Blob([before], { type: 'image/png' })]])
      const r = createAssetResolver(assets)
      const u1 = r.resolve(TEX_ID)
      assets.set(TEX_ID, new Blob([after], { type: 'image/png' }))
      const u2 = r.resolve(TEX_ID)
      expect(u1).toBeTruthy()
      expect(u2).toBeTruthy()
      expect(u1).not.toBe(u2)
      r.dispose()
    })
  })

  describe('copy-on-first-paint routing', () => {
    it('forks write target for imported-style texture ids so originals can stay in the asset map', () => {
      const originalId = 'asset_imported_abc'
      const r = resolvePaintStrokeWriteTarget(originalId)
      expect(r.entityShouldPointToWriteId).toBe(true)
      expect(r.writeAssetId).not.toBe(originalId)
    })

    it('reuses the same tex_paint id for subsequent strokes', () => {
      const copyId = 'tex_paint_1_x'
      const a = resolvePaintStrokeWriteTarget(copyId)
      const b = resolvePaintStrokeWriteTarget(copyId)
      expect(a.writeAssetId).toBe(copyId)
      expect(b.writeAssetId).toBe(copyId)
    })
  })
})
