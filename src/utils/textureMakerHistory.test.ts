import { describe, it, expect } from 'vitest'
import { createTextureMakerHistory, cloneTextureMakerSnapshot } from './textureMakerHistory'
import type { TextureDocument } from '@/utils/textureCompositor'

function makeDoc(width: number): TextureDocument {
  return {
    version: '1',
    compositeAssetId: 'composite_x',
    width,
    height: 64,
    layers: [
      {
        id: 'layer1',
        name: 'L1',
        assetId: 'texlayer_a',
        opacity: 1,
        blendMode: 'normal' as const,
        visible: true,
      },
    ],
  }
}

describe('createTextureMakerHistory', () => {
  it('pushes, undoes, and redoes with independent snapshots', () => {
    const h = createTextureMakerHistory(50)
    const d0 = makeDoc(64)
    const a0 = new Map<string, Blob>()
    const d1 = makeDoc(128)
    const a1 = new Map(a0)

    h.pushBeforeMutation(d0, a0, 'layer1')
    const u1 = h.undo(d1, a1, 'layer1')
    expect(u1?.doc.width).toBe(64)

    const r = h.redo(d0, a0, 'layer1')
    expect(r?.doc.width).toBe(128)
  })

  it('clears redo on new push', () => {
    const h = createTextureMakerHistory(50)
    const d = makeDoc(64)
    const assets = new Map<string, Blob>()
    h.pushBeforeMutation(d, assets, null)
    h.undo(d, assets, null)
    expect(h.canRedo()).toBe(true)
    h.pushBeforeMutation(d, assets, null)
    expect(h.canRedo()).toBe(false)
  })

  it('drops oldest checkpoints when exceeding max depth', () => {
    const h = createTextureMakerHistory(2)
    const assets = new Map<string, Blob>()
    const d0 = makeDoc(0)
    const d1 = makeDoc(1)
    const d2 = makeDoc(2)
    const d3 = makeDoc(3)
    h.pushBeforeMutation(d0, assets, null)
    h.pushBeforeMutation(d1, assets, null)
    h.pushBeforeMutation(d2, assets, null)
    const u1 = h.undo(d3, assets, null)
    expect(u1?.doc.width).toBe(2)
    const u2 = h.undo(u1!.doc, assets, null)
    expect(u2?.doc.width).toBe(1)
    expect(h.undo(u2!.doc, assets, null)).toBeNull()
  })

  it('clear empties stacks', () => {
    const h = createTextureMakerHistory(10)
    const d = makeDoc(64)
    const assets = new Map<string, Blob>()
    h.pushBeforeMutation(d, assets, null)
    h.clear()
    expect(h.canUndo()).toBe(false)
    expect(h.undo(d, assets, null)).toBeNull()
  })
})

describe('cloneTextureMakerSnapshot', () => {
  it('deep-clones doc and shallow-copies asset map', () => {
    const d = makeDoc(64)
    const b = new Blob(['x'])
    const m = new Map([['a', b]])
    const s = cloneTextureMakerSnapshot(d, m, 'layer1')
    s.doc.width = 999
    expect(d.width).toBe(64)
    expect(s.assets.get('a')).toBe(b)
    expect(s.selectedLayerId).toBe('layer1')
  })
})
