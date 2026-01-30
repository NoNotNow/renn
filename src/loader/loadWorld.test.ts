import { describe, it, expect } from 'vitest'
import { loadWorld } from '@/loader/loadWorld'
import { createDefaultEntity, type AddableShapeType } from '@/data/entityDefaults'
import type { RennWorld } from '@/types/world'

function minimalWorldWithShapes(): RennWorld {
  const types: AddableShapeType[] = ['box', 'sphere', 'cylinder', 'capsule', 'plane']
  const entities = types.map((t) => createDefaultEntity(t))
  return {
    version: '1.0',
    world: {
      gravity: [0, -9.81, 0],
      camera: { mode: 'follow', target: entities[0].id, distance: 10, height: 2 },
    },
    entities,
  }
}

describe('loadWorld', () => {
  it('loads world with one entity of each primitive shape without throwing', () => {
    const world = minimalWorldWithShapes()
    const result = loadWorld(world)
    expect(result.entities).toHaveLength(5)
    expect(result.scene).toBeDefined()
    expect(result.world).toBe(world)
  })

  it('returns one LoadedEntity per world entity with mesh and entity', () => {
    const world = minimalWorldWithShapes()
    const { entities } = loadWorld(world)
    for (const loaded of entities) {
      expect(loaded.entity).toBeDefined()
      expect(loaded.entity.id).toBeDefined()
      expect(loaded.mesh).toBeDefined()
      expect(loaded.mesh.name).toBe(loaded.entity.id)
    }
  })
})
