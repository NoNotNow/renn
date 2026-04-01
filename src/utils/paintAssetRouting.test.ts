import { describe, it, expect } from 'vitest'
import {
  resolvePaintStrokeWriteTarget,
  TEXTURE_LAYER_PREFIX,
  TEXTURE_PAINT_COPY_PREFIX,
} from '@/utils/paintAssetRouting'

describe('paintAssetRouting', () => {
  it('forks imported-style ids to a new tex_paint id', () => {
    const r = resolvePaintStrokeWriteTarget('asset_123_abc')
    expect(r.entityShouldPointToWriteId).toBe(true)
    expect(r.writeAssetId.startsWith(TEXTURE_PAINT_COPY_PREFIX)).toBe(true)
    expect(r.writeAssetId).not.toBe('asset_123_abc')
  })

  it('reuses tex_paint id without remapping entity', () => {
    const id = `${TEXTURE_PAINT_COPY_PREFIX}1_x`
    const r = resolvePaintStrokeWriteTarget(id)
    expect(r.writeAssetId).toBe(id)
    expect(r.entityShouldPointToWriteId).toBe(false)
  })

  it('reuses texlayer id without remapping entity', () => {
    const id = `${TEXTURE_LAYER_PREFIX}1_y`
    const r = resolvePaintStrokeWriteTarget(id)
    expect(r.writeAssetId).toBe(id)
    expect(r.entityShouldPointToWriteId).toBe(false)
  })
})
