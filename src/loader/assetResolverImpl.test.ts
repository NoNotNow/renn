import { describe, it, expect } from 'vitest'
import { createAssetResolver, createAssetResolverFromGetter } from './assetResolverImpl'

describe('createAssetResolver', () => {
  it('issues a new object URL when the Blob for an id is replaced', () => {
    const a = new Blob(['a'], { type: 'text/plain' })
    const b = new Blob(['b'], { type: 'text/plain' })
    const assets = new Map<string, Blob>([['x', a]])
    const r = createAssetResolver(assets)
    const u1 = r.resolve('x')
    expect(u1).toBeTruthy()
    assets.set('x', b)
    const u2 = r.resolve('x')
    expect(u2).toBeTruthy()
    expect(u2).not.toBe(u1)
    r.dispose()
  })

  it('getter resolver sees map updates under the same variable', () => {
    const assets = new Map<string, Blob>([['x', new Blob(['1'])]])
    const r = createAssetResolverFromGetter(() => assets)
    const u1 = r.resolve('x')
    assets.set('x', new Blob(['2']))
    const u2 = r.resolve('x')
    expect(u1).toBeTruthy()
    expect(u2).toBeTruthy()
    expect(u1).not.toBe(u2)
    r.dispose()
  })

  it('revokes cached URL when asset id is removed from the map', () => {
    const assets = new Map<string, Blob>([['x', new Blob(['1'])]])
    const r = createAssetResolver(assets)
    const u = r.resolve('x')
    expect(u).toBeTruthy()
    assets.delete('x')
    expect(r.resolve('x')).toBeNull()
    r.dispose()
  })
})
