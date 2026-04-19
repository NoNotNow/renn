import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { RennWorld } from '@/types/world'
import { useTextureDialogAssets } from './useTextureDialogAssets'

function imageBlob(): Blob {
  return new Blob(['x'], { type: 'image/png' })
}

function videoBlob(): Blob {
  return new Blob(['x'], { type: 'video/mp4' })
}

function emptyWorld(assets: Record<string, { type: 'video' | 'texture' }> = {}): RennWorld {
  return {
    version: '0.0.0',
    world: {} as RennWorld['world'],
    entities: [],
    assets,
  }
}

function makeAssetMap(entries: Record<string, Blob>): Map<string, Blob> {
  return new Map(Object.entries(entries))
}

describe('useTextureDialogAssets', () => {
  it('returns all images sorted by id and a non-empty leftColumn when no search', () => {
    const assets = makeAssetMap({
      'banana.png': imageBlob(),
      'apple.png': imageBlob(),
    })
    const { result } = renderHook(() => useTextureDialogAssets(assets, emptyWorld(), true))
    expect(result.current.filteredTextures.map((t) => t.id)).toEqual(['apple.png', 'banana.png'])
    expect(result.current.leftColumnEmpty).toBe(false)
    expect(result.current.dialogGroups).toHaveLength(2)
    expect(result.current.dialogGroups[0]).toMatchObject({ kind: 'single', id: 'apple.png' })
  })

  it('skips internal compositor keys (composite_, texdoc_, texlayer_, tex_paint_)', () => {
    const assets = makeAssetMap({
      'real.png': imageBlob(),
      composite_x: imageBlob(),
      texdoc_x: imageBlob(),
      texlayer_x: imageBlob(),
      tex_paint_x: imageBlob(),
    })
    const { result } = renderHook(() => useTextureDialogAssets(assets, emptyWorld(), true))
    expect(result.current.filteredTextures.map((t) => t.id)).toEqual(['real.png'])
  })

  it('search query filters texture and video lists case-insensitively', () => {
    const assets = makeAssetMap({
      'cat.png': imageBlob(),
      'dog.png': imageBlob(),
      'kitty.mp4': videoBlob(),
      'puppy.mp4': videoBlob(),
    })
    const world = emptyWorld({ 'kitty.mp4': { type: 'video' }, 'puppy.mp4': { type: 'video' } })
    const { result } = renderHook(() => useTextureDialogAssets(assets, world, true))
    act(() => result.current.setSearchQuery('CAT'))
    expect(result.current.filteredTextures.map((t) => t.id)).toEqual(['cat.png'])
    expect(result.current.filteredVideos.map((v) => v.id)).toEqual([])
    act(() => result.current.setSearchQuery('itty'))
    expect(result.current.filteredVideos.map((v) => v.id)).toEqual(['kitty.mp4'])
  })

  it('groups `_editedN` ids into a family with newest version first', () => {
    const assets = makeAssetMap({
      'wood.png': imageBlob(),
      'wood_edited1.png': imageBlob(),
      'wood_edited2.png': imageBlob(),
      'metal.png': imageBlob(),
    })
    const { result } = renderHook(() => useTextureDialogAssets(assets, emptyWorld(), true))
    const family = result.current.dialogGroups.find((g) => g.kind === 'family')
    expect(family).toBeDefined()
    if (family && family.kind === 'family') {
      expect(family.stem).toBe('wood')
      expect(family.versions.map((v) => v.n)).toEqual([2, 1])
    }
  })

  it('toggleFamilyExpanded flips the entry in `expandedFamilies`', () => {
    const assets = makeAssetMap({
      'wood_edited1.png': imageBlob(),
      'wood_edited2.png': imageBlob(),
    })
    const { result } = renderHook(() => useTextureDialogAssets(assets, emptyWorld(), true))
    expect(result.current.expandedFamilies.has('wood')).toBe(false)
    act(() => result.current.toggleFamilyExpanded('wood'))
    expect(result.current.expandedFamilies.has('wood')).toBe(true)
    act(() => result.current.toggleFamilyExpanded('wood'))
    expect(result.current.expandedFamilies.has('wood')).toBe(false)
  })

  it('filteredVideos is always empty when allowVideo is false', () => {
    const assets = makeAssetMap({
      'k.mp4': videoBlob(),
      'i.png': imageBlob(),
    })
    const world = emptyWorld({ 'k.mp4': { type: 'video' } })
    const { result } = renderHook(() => useTextureDialogAssets(assets, world, false))
    expect(result.current.filteredVideos).toEqual([])
    expect(result.current.filteredTextures.map((t) => t.id)).toEqual(['i.png'])
  })

  it('leftColumnEmpty is true when both lists are empty after filtering', () => {
    const assets = makeAssetMap({ 'a.png': imageBlob() })
    const { result } = renderHook(() => useTextureDialogAssets(assets, emptyWorld(), true))
    expect(result.current.leftColumnEmpty).toBe(false)
    act(() => result.current.setSearchQuery('zzz-no-match'))
    expect(result.current.leftColumnEmpty).toBe(true)
  })

  it('blobById covers grouped versions too (lookup works for `_editedN` ids)', () => {
    const assets = makeAssetMap({
      'wood_edited1.png': imageBlob(),
      'wood_edited2.png': imageBlob(),
    })
    const { result } = renderHook(() => useTextureDialogAssets(assets, emptyWorld(), true))
    expect(result.current.blobById.has('wood_edited1.png')).toBe(true)
    expect(result.current.blobById.has('wood_edited2.png')).toBe(true)
  })
})
