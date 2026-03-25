import { describe, it, expect } from 'vitest'
import { createEditorHistory, cloneEditorSnapshot } from './editorHistory'
import type { RennWorld } from '@/types/world'
import { sampleWorld } from '@/data/sampleWorld'

function makeWorld(entities: RennWorld['entities']): RennWorld {
  return { ...sampleWorld, entities }
}

describe('createEditorHistory', () => {
  it('pushes, undoes, and redoes with independent snapshots', () => {
    const h = createEditorHistory(50)
    const w0 = makeWorld(sampleWorld.entities)
    const a0 = new Map<string, Blob>()
    const w1 = makeWorld([...sampleWorld.entities, { ...sampleWorld.entities[0], id: 'new', name: 'New' }])
    const a1 = new Map(a0)

    h.pushBeforeMutation(w0, a0)
    const u1 = h.undo(w1, a1)
    expect(u1?.world.entities.length).toBe(sampleWorld.entities.length)

    const r = h.redo(w0, a0)
    expect(r?.world.entities.length).toBe(w1.entities.length)
  })

  it('clears redo on new push', () => {
    const h = createEditorHistory(50)
    const w = makeWorld(sampleWorld.entities)
    const assets = new Map<string, Blob>()
    h.pushBeforeMutation(w, assets)
    h.undo(w, assets)
    expect(h.canRedo()).toBe(true)
    h.pushBeforeMutation(w, assets)
    expect(h.canRedo()).toBe(false)
  })

  it('drops oldest checkpoints when exceeding max depth', () => {
    const h = createEditorHistory(2)
    const assets = new Map<string, Blob>()
    const mk = (name: string) =>
      makeWorld(sampleWorld.entities.map((e, i) => (i === 0 ? { ...e, name } : e)))
    const w0 = mk('v0')
    const w1 = mk('v1')
    const w2 = mk('v2')
    const w3 = mk('v3')
    h.pushBeforeMutation(w0, assets)
    h.pushBeforeMutation(w1, assets)
    h.pushBeforeMutation(w2, assets)
    const u1 = h.undo(w3, assets)
    expect(u1?.world.entities[0].name).toBe('v2')
    const u2 = h.undo(u1!.world, assets)
    expect(u2?.world.entities[0].name).toBe('v1')
    expect(h.undo(u2!.world, assets)).toBeNull()
  })

  it('clear empties stacks', () => {
    const h = createEditorHistory(10)
    const w = makeWorld(sampleWorld.entities)
    const assets = new Map<string, Blob>()
    h.pushBeforeMutation(w, assets)
    h.clear()
    expect(h.canUndo()).toBe(false)
    expect(h.undo(w, assets)).toBeNull()
  })
})

describe('cloneEditorSnapshot', () => {
  it('deep-clones world and shallow-copies asset map', () => {
    const w = makeWorld(sampleWorld.entities)
    const b = new Blob(['x'])
    const m = new Map([['a', b]])
    const s = cloneEditorSnapshot(w, m)
    s.world.entities[0] = { ...s.world.entities[0], name: 'mutated' }
    expect(w.entities[0].name).not.toBe('mutated')
    expect(s.assets.get('a')).toBe(b)
  })
})
