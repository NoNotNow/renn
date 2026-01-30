import * as THREE from 'three'
import { validateWorldDocument } from '@/schema/validate'
import type { RennWorld, Entity, Vec3, Quat } from '@/types/world'
import {
  DEFAULT_GRAVITY,
  DEFAULT_POSITION,
  DEFAULT_ROTATION,
  DEFAULT_SCALE,
} from '@/types/world'
import { buildEntityMesh } from './createPrimitive'
import type { AssetResolver } from './assetResolver'

export interface LoadedEntity {
  entity: Entity
  mesh: THREE.Mesh
}

export interface LoadWorldResult {
  scene: THREE.Scene
  entities: LoadedEntity[]
  world: RennWorld
}

/**
 * Loads a world document: validates, builds Three.js scene and entity meshes.
 * Does not run physics or scripts; caller attaches physics and script runner.
 */
export function loadWorld(
  worldData: unknown,
  _resolveAsset?: AssetResolver
): LoadWorldResult {
  validateWorldDocument(worldData)
  const world = worldData as RennWorld

  const scene = new THREE.Scene()

  const gravity = world.world.gravity ?? DEFAULT_GRAVITY
  scene.userData.gravity = gravity

  const ambient = world.world.ambientLight
  if (ambient) {
    const [r, g, b] = ambient
    scene.add(new THREE.AmbientLight(new THREE.Color(r, g, b), 1))
  }

  const skyColor = world.world.skyColor
  if (skyColor) {
    const [r, g, b] = skyColor
    scene.background = new THREE.Color(r, g, b)
  }

  scene.userData.camera = world.world.camera ?? { mode: 'follow', target: '', distance: 10, height: 2 }
  scene.userData.world = world

  const entities: LoadedEntity[] = []

  for (const entity of world.entities) {
    const position: Vec3 = entity.position ?? DEFAULT_POSITION
    const rotation: Quat = entity.rotation ?? DEFAULT_ROTATION
    const scale: Vec3 = entity.scale ?? DEFAULT_SCALE

    const shape = entity.shape
    const mesh = shape
      ? buildEntityMesh(shape, entity.material, position, rotation, scale)
      : new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: 0x888888 })
        )

    mesh.name = entity.id
    mesh.userData.entityId = entity.id
    mesh.userData.entity = entity
    mesh.userData.bodyType = entity.bodyType ?? 'static'

    scene.add(mesh)
    entities.push({ entity, mesh })
  }

  return { scene, entities, world }
}
