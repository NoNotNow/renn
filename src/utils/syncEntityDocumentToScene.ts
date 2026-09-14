import type { Entity, RennWorld } from '@/types/world'
import { resolveEntityStageRuntime } from '@/utils/pipeStageResolve'
import type { TransformerConfig } from '@/types/transformer'
import type { Vec3, Rotation } from '@/types/world'

type EntityPhysicsPatch = Partial<
  Pick<Entity, 'mass' | 'restitution' | 'friction' | 'linearDamping' | 'angularDamping' | 'bodyType'>
>

export interface EntitySceneSyncOps {
  updateEntityPose: (id: string, pose: { position?: Vec3; rotation?: Rotation; scale?: Vec3 }) => void
  updateEntityPhysics: (id: string, patch: EntityPhysicsPatch) => void
  updateEntityShape: (id: string, entity: Entity) => boolean
  updateEntityMaterial: (id: string, entity: Entity) => Promise<void>
  updateEntityModelTransform: (
    id: string,
    patch: { modelPosition?: Vec3; modelRotation?: Rotation; modelScale?: Vec3; doubleSided?: boolean },
  ) => void
  refreshEntityAppearance: (id: string, entity: Entity) => void
  syncEntityTransformers: (id: string, configs: TransformerConfig[] | undefined) => void
}

function physicsFieldsChanged(prev: Entity, next: Entity): boolean {
  return (
    prev.bodyType !== next.bodyType ||
    prev.mass !== next.mass ||
    prev.restitution !== next.restitution ||
    prev.friction !== next.friction ||
    prev.linearDamping !== next.linearDamping ||
    prev.angularDamping !== next.angularDamping
  )
}

function poseChanged(prev: Entity, next: Entity): boolean {
  return (
    JSON.stringify(prev.position) !== JSON.stringify(next.position) ||
    JSON.stringify(prev.rotation) !== JSON.stringify(next.rotation) ||
    JSON.stringify(prev.scale) !== JSON.stringify(next.scale)
  )
}

function shapeChanged(prev: Entity, next: Entity): boolean {
  return JSON.stringify(prev.shape) !== JSON.stringify(next.shape)
}

function materialChanged(prev: Entity, next: Entity): boolean {
  return JSON.stringify(prev.material) !== JSON.stringify(next.material)
}

function modelTransformChanged(prev: Entity, next: Entity): boolean {
  return (
    JSON.stringify(prev.modelPosition) !== JSON.stringify(next.modelPosition) ||
    JSON.stringify(prev.modelRotation) !== JSON.stringify(next.modelRotation) ||
    JSON.stringify(prev.modelScale) !== JSON.stringify(next.modelScale) ||
    prev.doubleSided !== next.doubleSided
  )
}

function transformersChanged(prev: Entity, next: Entity): boolean {
  return JSON.stringify(prev.transformers) !== JSON.stringify(next.transformers)
}

function appearanceFieldsChanged(prev: Entity, next: Entity): boolean {
  return prev.name !== next.name || prev.locked !== next.locked || prev.avatar !== next.avatar
}

/** Apply document-only entity field changes to the live scene (no full reload). */
export function syncEntityDocumentToScene(
  scene: EntitySceneSyncOps,
  world: RennWorld,
  prev: Entity,
  next: Entity,
): void {
  if (poseChanged(prev, next)) {
    scene.updateEntityPose(next.id, {
      position: next.position,
      rotation: next.rotation,
      scale: next.scale,
    })
  }
  if (physicsFieldsChanged(prev, next)) {
    scene.updateEntityPhysics(next.id, {
      bodyType: next.bodyType,
      mass: next.mass,
      restitution: next.restitution,
      friction: next.friction,
      linearDamping: next.linearDamping,
      angularDamping: next.angularDamping,
    })
  }
  if (shapeChanged(prev, next)) {
    scene.updateEntityShape(next.id, next)
  }
  if (materialChanged(prev, next)) {
    void scene.updateEntityMaterial(next.id, next)
  }
  if (modelTransformChanged(prev, next)) {
    scene.updateEntityModelTransform(next.id, {
      modelPosition: next.modelPosition,
      modelRotation: next.modelRotation,
      modelScale: next.modelScale,
      doubleSided: next.doubleSided,
    })
  }
  if (transformersChanged(prev, next)) {
    const configs = resolveEntityStageRuntime(world, next).runtimeConfigs()
    scene.syncEntityTransformers(next.id, configs ?? undefined)
  }
  if (appearanceFieldsChanged(prev, next)) {
    scene.refreshEntityAppearance(next.id, next)
  }
}
