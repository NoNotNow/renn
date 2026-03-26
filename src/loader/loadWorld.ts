import * as THREE from 'three'
import { validateWorldDocument } from '@/schema/validate'
import { migrateWorldScripts } from '@/scripts/migrateWorld'
import type { RennWorld, Entity, Vec3, Rotation } from '@/types/world'
import {
  DEFAULT_GRAVITY,
  DEFAULT_POSITION,
  DEFAULT_ROTATION,
  DEFAULT_SCALE,
} from '@/types/world'
import { buildEntityMesh } from './createPrimitive'
import { syncShapeWireframeOverlay } from './shapeWireframeOverlay'
import { createAssetResolver, type DisposableAssetResolver } from './assetResolverImpl'
import { getSceneUserData } from '@/types/sceneUserData'
import { eulerToQuaternion } from '@/utils/rotationUtils'
import { computeDirectionalShadowCameraExtent } from '@/utils/shadowBounds'

export interface LoadedEntity {
  entity: Entity
  mesh: THREE.Mesh
}

export interface LoadWorldResult {
  scene: THREE.Scene
  entities: LoadedEntity[]
  world: RennWorld
  assetResolver: DisposableAssetResolver | null
}

/**
 * Loads a world document: validates, builds Three.js scene and entity meshes.
 * Does not run physics or scripts; caller attaches physics and script runner.
 */
export async function loadWorld(
  worldData: unknown,
  assets?: Map<string, Blob>
): Promise<LoadWorldResult> {
  migrateWorldScripts(worldData)
  validateWorldDocument(worldData)
  const world = worldData as RennWorld

  const scene = new THREE.Scene()
  const userData = getSceneUserData(scene)

  const gravity = world.world.gravity ?? DEFAULT_GRAVITY
  userData.gravity = gravity

  const ambient = world.world.ambientLight
  if (ambient) {
    const [r, g, b] = ambient
    scene.add(new THREE.AmbientLight(new THREE.Color(r, g, b), 1))
  }

  const dirLightConfig = world.world.directionalLight
  const dirDirection = dirLightConfig?.direction ?? [1, 2, 1]
  const dirColor = dirLightConfig?.color ?? [1, 0.98, 0.9]
  const dirIntensity = dirLightConfig?.intensity ?? 1.2

  const shadowExtent = computeDirectionalShadowCameraExtent(world.entities)

  const dirLight = new THREE.DirectionalLight(
    new THREE.Color(dirColor[0], dirColor[1], dirColor[2]),
    dirIntensity
  )
  const [dx, dy, dz] = dirDirection
  const dist = 50
  dirLight.position.set(dx * dist, dy * dist, dz * dist)
  dirLight.target.position.set(0, 0, 0)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.width = 2048
  dirLight.shadow.mapSize.height = 2048
  dirLight.shadow.bias = -0.0001
  const shadowCam = dirLight.shadow.camera
  shadowCam.left = -shadowExtent
  shadowCam.right = shadowExtent
  shadowCam.top = shadowExtent
  shadowCam.bottom = -shadowExtent
  shadowCam.near = 0.5
  shadowCam.far = 150
  shadowCam.updateProjectionMatrix()
  scene.add(dirLight)
  scene.add(dirLight.target)
  userData.directionalLight = dirLight

  const skyColor = world.world.skyColor
  if (skyColor) {
    const [r, g, b] = skyColor
    scene.background = new THREE.Color(r, g, b)
  }

  userData.camera = world.world.camera ?? { control: 'free', mode: 'follow', target: '', distance: 10, height: 2 }
  userData.world = world

  // Create asset resolver if assets are provided
  const assetResolver = assets ? createAssetResolver(assets) : null

  const entities: LoadedEntity[] = []

  for (const entity of world.entities) {
    const position: Vec3 = entity.position ?? DEFAULT_POSITION
    const rotation: Rotation = entity.rotation ?? DEFAULT_ROTATION
    const scale: Vec3 = entity.scale ?? DEFAULT_SCALE

    const shape = entity.shape
    let mesh: THREE.Mesh
    try {
      mesh = shape
        ? await buildEntityMesh(shape, entity.material, position, rotation, scale, assetResolver ?? undefined, entity.model, entity.modelRotation, entity.modelScale)
        : new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshStandardMaterial({ color: 0x888888 })
          )
    } catch (err) {
      console.warn(`[loadWorld] Failed to build mesh for entity "${entity.id}", using placeholder:`, err)
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xff4444, wireframe: true })
      )
      mesh.position.set(position[0], position[1], position[2])
      mesh.quaternion.copy(eulerToQuaternion(rotation))
      mesh.scale.set(scale[0], scale[1], scale[2])
    }

    mesh.name = entity.id
    mesh.userData.entityId = entity.id
    mesh.userData.entity = entity
    mesh.userData.bodyType = entity.bodyType ?? 'static'
    const isPlane = shape?.type === 'plane'
    // GLTF/model hierarchies: propagate userData and set shadow flags on every mesh so trimesh/entity.model cast shadows like primitives
    mesh.traverse((child) => {
      child.userData.entityId = entity.id
      child.userData.entity = entity
      if (child instanceof THREE.Mesh) {
        child.castShadow = !isPlane
        child.receiveShadow = true
      }
    })

    if (mesh instanceof THREE.Mesh) {
      syncShapeWireframeOverlay(mesh, entity)
    }

    scene.add(mesh)
    entities.push({ entity, mesh })
  }

  return { scene, entities, world, assetResolver }
}
