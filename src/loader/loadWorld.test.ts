import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { loadWorld } from '@/loader/loadWorld'
import { createDefaultEntity, type AddableShapeType } from '@/data/entityDefaults'
import type { RennWorld } from '@/types/world'
import { getSceneUserData } from '@/types/sceneUserData'

function minimalWorldWithShapes(): RennWorld {
  const types: AddableShapeType[] = ['box', 'sphere', 'cylinder', 'capsule', 'plane']
  const entities = types.map((t) => createDefaultEntity(t))
  return {
    version: '1.0',
    world: {
      gravity: [0, -9.81, 0],
      camera: { control: 'free', mode: 'follow', target: entities[0].id, distance: 10, height: 2 },
    },
    entities,
  }
}

function collectMeshes(obj: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child)
  })
  return meshes
}

describe('loadWorld', () => {
  it('loads world with one entity of each primitive shape without throwing', async () => {
    const world = minimalWorldWithShapes()
    const result = await loadWorld(world)
    expect(result.entities).toHaveLength(5)
    expect(result.scene).toBeDefined()
    expect(result.world).toBe(world)
    expect(result.warnings).toEqual([])
  })

  it('returns one LoadedEntity per world entity with mesh and entity', async () => {
    const world = minimalWorldWithShapes()
    const { entities } = await loadWorld(world)
    for (const loaded of entities) {
      expect(loaded.entity).toBeDefined()
      expect(loaded.entity.id).toBeDefined()
      expect(loaded.mesh).toBeDefined()
      expect(loaded.mesh.name).toBe(loaded.entity.id)
    }
  })

  it('sets castShadow and receiveShadow on every mesh in hierarchy (non-plane)', async () => {
    const world: RennWorld = {
      version: '1.0',
      world: { gravity: [0, -9.81, 0] },
      entities: [createDefaultEntity('box')],
    }
    const { entities } = await loadWorld(world)
    const meshes = collectMeshes(entities[0].mesh)
    expect(meshes.length).toBeGreaterThanOrEqual(1)
    for (const m of meshes) {
      expect(m.castShadow).toBe(true)
      expect(m.receiveShadow).toBe(true)
    }
  })

  it('sets castShadow false on plane meshes, receiveShadow true', async () => {
    const world: RennWorld = {
      version: '1.0',
      world: { gravity: [0, -9.81, 0] },
      entities: [createDefaultEntity('plane')],
    }
    const { entities } = await loadWorld(world)
    const meshes = collectMeshes(entities[0].mesh)
    expect(meshes.length).toBeGreaterThanOrEqual(1)
    for (const m of meshes) {
      expect(m.castShadow).toBe(false)
      expect(m.receiveShadow).toBe(true)
    }
  })

  it('uses MeshStandardMaterial for primitives so they respond to lights', async () => {
    const world: RennWorld = {
      version: '1.0',
      world: { gravity: [0, -9.81, 0] },
      entities: [createDefaultEntity('box')],
    }
    const { entities } = await loadWorld(world)
    const mesh = entities[0].mesh
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(mat).not.toBeInstanceOf(THREE.MeshBasicMaterial)
  })

  it('sets directional shadow camera bounds based on the largest plane entity', async () => {
    const plane = createDefaultEntity('plane')
    plane.position = [10, 0, -20]
    plane.scale = [2, 3, 1]

    const world: RennWorld = {
      version: '1.0',
      world: { gravity: [0, -9.81, 0] },
      entities: [plane],
    }

    const { scene } = await loadWorld(world)
    const sceneUserData = getSceneUserData(scene)
    const dirLight = sceneUserData.directionalLight
    expect(dirLight).toBeDefined()

    const baseHalf = 100
    const halfX = baseHalf * Math.abs(plane.scale[0])
    const halfZ = baseHalf * Math.abs(plane.scale[1])
    const bound = Math.max(Math.abs(plane.position[0]) + halfX, Math.abs(plane.position[2]) + halfZ)
    const expectedExtent = Math.max(bound * 1.1, 40)

    const shadowCam = dirLight!.shadow.camera
    expect(shadowCam.left).toBeCloseTo(-expectedExtent)
    expect(shadowCam.right).toBeCloseTo(expectedExtent)
    expect(shadowCam.top).toBeCloseTo(expectedExtent)
    expect(shadowCam.bottom).toBeCloseTo(-expectedExtent)
  })
})
