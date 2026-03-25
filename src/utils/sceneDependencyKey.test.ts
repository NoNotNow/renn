import { describe, it, expect } from 'vitest'
import { getSceneDependencyKey } from './sceneDependencyKey'
import type { RennWorld } from '@/types/world'

function minimalWorld(overrides?: Partial<RennWorld>): RennWorld {
  return {
    version: '1.0',
    world: {
      ambientLight: [0.3, 0.3, 0.35],
      directionalLight: { direction: [1, 2, 1], color: [1, 0.98, 0.9], intensity: 1.2 },
    },
    entities: [
      {
        id: 'e1',
        name: 'Entity 1',
        bodyType: 'static',
        shape: { type: 'box', width: 1, height: 1, depth: 1 },
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        locked: false,
      },
    ],
    ...overrides,
  }
}

describe('getSceneDependencyKey', () => {
  it('returns the same key for the same world', () => {
    const world = minimalWorld()
    expect(getSceneDependencyKey(world)).toBe(getSceneDependencyKey(world))
  })

  it('returns the same key when only entity name changes', () => {
    const a = minimalWorld()
    const b = minimalWorld({
      entities: [{ ...a.entities[0], name: 'Other Name' }],
    })
    expect(getSceneDependencyKey(a)).toBe(getSceneDependencyKey(b))
  })

  it('returns the same key when only entity locked changes', () => {
    const a = minimalWorld()
    const b = minimalWorld({
      entities: [{ ...a.entities[0], locked: true }],
    })
    expect(getSceneDependencyKey(a)).toBe(getSceneDependencyKey(b))
  })

  it('returns the same key when only position or rotation changes', () => {
    const a = minimalWorld()
    const b = minimalWorld({
      entities: [{ ...a.entities[0], position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] }],
    })
    expect(getSceneDependencyKey(a)).toBe(getSceneDependencyKey(b))
  })

  it('returns the same key when only entity scale changes (incremental path)', () => {
    const a = minimalWorld()
    const b = minimalWorld({
      entities: [{ ...a.entities[0], scale: [2, 0.5, 1] }],
    })
    expect(getSceneDependencyKey(a)).toBe(getSceneDependencyKey(b))
  })

  it('returns the same key when a primitive shape changes (incremental path)', () => {
    const a = minimalWorld()
    const b = minimalWorld({
      entities: [{ ...a.entities[0], shape: { type: 'sphere', radius: 2 } }],
    })
    // Primitive shape changes are handled incrementally — they must NOT trigger a rebuild.
    expect(getSceneDependencyKey(a)).toBe(getSceneDependencyKey(b))
  })

  it('returns a different key when shape changes to trimesh (requires asset load)', () => {
    const a = minimalWorld()
    const b = minimalWorld({
      entities: [{ ...a.entities[0], shape: { type: 'trimesh', model: 'my-model' } }],
    })
    expect(getSceneDependencyKey(a)).not.toBe(getSceneDependencyKey(b))
  })

  it('returns the same key when entity physics or material changes (incremental path)', () => {
    const a = minimalWorld()
    const b = minimalWorld({
      entities: [{ ...a.entities[0], mass: 10, material: { color: [1, 0, 0] } }],
    })
    // Physics and material are now handled incrementally — must NOT trigger a rebuild.
    expect(getSceneDependencyKey(a)).toBe(getSceneDependencyKey(b))
  })

  it('returns a different key when scripts change', () => {
    const a = minimalWorld()
    const b = minimalWorld({
      entities: [{ ...a.entities[0], scripts: ['script-1'] }],
    })
    expect(getSceneDependencyKey(a)).not.toBe(getSceneDependencyKey(b))
  })

  it('returns the same key when only transformer enabled flags change (incremental sync)', () => {
    const baseTf = [{ type: 'input' as const, priority: 10, enabled: true }]
    const a = minimalWorld({
      entities: [{ ...minimalWorld().entities[0], transformers: baseTf }],
    })
    const b = minimalWorld({
      entities: [{ ...minimalWorld().entities[0], transformers: [{ type: 'input', priority: 10, enabled: false }] }],
    })
    expect(getSceneDependencyKey(a)).toBe(getSceneDependencyKey(b))
  })

  it('returns a different key when transformer type changes', () => {
    const a = minimalWorld({
      entities: [{ ...minimalWorld().entities[0], transformers: [{ type: 'input' }] }],
    })
    const b = minimalWorld({
      entities: [{ ...minimalWorld().entities[0], transformers: [{ type: 'car2' }] }],
    })
    expect(getSceneDependencyKey(a)).not.toBe(getSceneDependencyKey(b))
  })

  it('returns the same key when only modelRotation or modelScale changes (incremental path)', () => {
    const base = minimalWorld({
      entities: [{ ...minimalWorld().entities[0], shape: { type: 'trimesh', model: 'm1' } }],
    })
    const withModelRotation = minimalWorld({
      entities: [{ ...base.entities[0], modelRotation: [0.1, 0, 0] }],
    })
    const withModelScale = minimalWorld({
      entities: [{ ...base.entities[0], modelScale: [2, 1, 1] }],
    })
    // modelRotation/modelScale are applied incrementally via updateEntityModelTransform.
    expect(getSceneDependencyKey(base)).toBe(getSceneDependencyKey(withModelRotation))
    expect(getSceneDependencyKey(base)).toBe(getSceneDependencyKey(withModelScale))
  })
})
