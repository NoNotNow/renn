import { describe, it, expect } from 'vitest'
import { collectMaterialMapAssetIds } from './prefetchMaterialTextures'
import type { Entity } from '@/types/world'

describe('collectMaterialMapAssetIds', () => {
  it('returns unique map ids from entity materials', () => {
    const entities: Entity[] = [
      { id: 'a', material: { map: 'tex1' } },
      { id: 'b', material: { map: 'tex2' } },
      { id: 'c', material: { map: 'tex1' } },
      { id: 'd' },
    ]
    const ids = collectMaterialMapAssetIds(entities)
    expect(ids).toHaveLength(2)
    expect(ids).toContain('tex1')
    expect(ids).toContain('tex2')
  })
})
