import type { RennWorld, Entity } from '@/types/world'

/**
 * Builds a stable string key from the parts of the world that require a full scene
 * rebuild (loadWorld + physics + registry). Used as the dependency for SceneView's
 * main effect so that edits that don't affect the scene (e.g. entity name, locked)
 * do not trigger a reload.
 *
 * Includes: entity list (id, scale, model, scripts, transformers, and shape only when
 * trimesh), world.scripts, world.assets refs, world.world lights.
 * Excludes: entity name, locked, position, rotation, bodyType, mass, restitution,
 * friction, linearDamping, angularDamping, primitive shape dimensions, material;
 * world.world gravity, skyColor, camera.
 */
export function getSceneDependencyKey(world: RennWorld): string {
  const payload: Record<string, unknown> = {
    version: world.version,
    assets: sortKeys(world.assets ?? {}),
    scripts: sortKeys(world.scripts ?? {}),
    worldLights: {
      ambientLight: world.world.ambientLight,
      directionalLight: world.world.directionalLight,
    },
    entities: world.entities.map((e) => sceneRelevantEntity(e)).sort((a, b) => (a.id < b.id ? -1 : 1)),
  }
  return JSON.stringify(payload)
}

function sceneRelevantEntity(entity: Entity): Record<string, unknown> {
  return {
    id: entity.id,
    // Only trimesh shapes require a full rebuild (loading a model asset).
    // Primitive shape changes are handled incrementally via updateEntityShape.
    trimeshShape: entity.shape?.type === 'trimesh' ? entity.shape : undefined,
    scale: entity.scale,
    model: entity.model,
    modelRotation: entity.modelRotation,
    modelScale: entity.modelScale,
    scripts: entity.scripts,
    transformers: entity.transformers,
  }
}

function sortKeys<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const keys = Object.keys(obj).sort()
  const out: Record<string, unknown> = {}
  for (const k of keys) {
    const v = obj[k]
    out[k] = v !== null && typeof v === 'object' && !Array.isArray(v) ? sortKeys(v as Record<string, unknown>) : v
  }
  return out
}
