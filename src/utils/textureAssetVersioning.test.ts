import { describe, it, expect } from 'vitest'
import {
  buildTextureDialogGroups,
  fileExtNoDotFromImageMime,
  inferEditFamilyFromMaterialMapId,
  isInternalTextureAssetKey,
  nextEditedTextureAssetKey,
  parseEditedTextureAssetId,
  sanitizeTextureStem,
} from '@/utils/textureAssetVersioning'

describe('textureAssetVersioning', () => {
  it('isInternalTextureAssetKey', () => {
    expect(isInternalTextureAssetKey('composite_1_x')).toBe(true)
    expect(isInternalTextureAssetKey('texdoc_composite_x')).toBe(true)
    expect(isInternalTextureAssetKey('texlayer_1')).toBe(true)
    expect(isInternalTextureAssetKey('tex_paint_1')).toBe(true)
    expect(isInternalTextureAssetKey('wall_edited1.png')).toBe(false)
    expect(isInternalTextureAssetKey('brick')).toBe(false)
  })

  it('parseEditedTextureAssetId', () => {
    expect(parseEditedTextureAssetId('foo_edited12.png')).toEqual({
      stem: 'foo',
      n: 12,
      extNoDot: 'png',
    })
    expect(parseEditedTextureAssetId('a_b_edited3')).toEqual({
      stem: 'a_b',
      n: 3,
      extNoDot: null,
    })
    expect(parseEditedTextureAssetId('nope')).toBe(null)
  })

  it('nextEditedTextureAssetKey increments', () => {
    const keys = ['foo_edited1.png', 'foo_edited2.png', 'bar_edited1.png']
    expect(nextEditedTextureAssetKey(keys, 'foo', 'png')).toBe('foo_edited3.png')
    expect(nextEditedTextureAssetKey(keys, 'bar', 'png')).toBe('bar_edited2.png')
    expect(nextEditedTextureAssetKey([], 'x', 'png')).toBe('x_edited1.png')
  })

  it('fileExtNoDotFromImageMime', () => {
    expect(fileExtNoDotFromImageMime('image/png')).toBe('png')
    expect(fileExtNoDotFromImageMime('image/jpeg')).toBe('jpg')
  })

  it('inferEditFamilyFromMaterialMapId', () => {
    expect(inferEditFamilyFromMaterialMapId('wood', 'image/png')).toEqual({
      stem: 'wood',
      extNoDot: 'png',
    })
    expect(inferEditFamilyFromMaterialMapId('wood_edited2.png', 'image/jpeg')).toEqual({
      stem: 'wood',
      extNoDot: 'png',
    })
  })

  it('sanitizeTextureStem', () => {
    expect(sanitizeTextureStem('  My Texture!  ')).toBe('My_Texture')
    expect(sanitizeTextureStem('')).toBe('texture')
  })

  it('buildTextureDialogGroups merges edited families and sorts', () => {
    const g = buildTextureDialogGroups(['z_only', 'a_edited2.png', 'a_edited1.png', 'solo'])
    const labels = g.map((x) => (x.kind === 'family' ? `fam:${x.stem}` : `one:${x.id}`))
    expect(labels).toContain('fam:a')
    expect(labels).toContain('one:solo')
    expect(labels).toContain('one:z_only')
    const fam = g.find((x) => x.kind === 'family' && x.stem === 'a')!
    expect(fam.kind).toBe('family')
    if (fam.kind === 'family') {
      expect(fam.versions.map((v) => v.n)).toEqual([2, 1])
    }
  })
})
