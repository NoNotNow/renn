import type { RennWorld, Entity } from '@/types/world'

/**
 * Builds a stable string key from the parts of the world that require a full scene
 * rebuild (loadWorld + physics + registry). Used as the dependency for SceneView's
 * main effect so that edits that don't affect the scene (e.g. entity name, locked)
 * do not trigger a reload.
 *
 * Includes: entity list (id, model, scripts, transformers structure, and shape only when
 * trimesh), world.scripts, world.assets refs, world.world lights. Transformer configs in the key
 * omit `enabled` — that flag is synced live via RenderItemRegistry.syncEntityTransformers.
 * Excludes: entity name, locked, position, rotation, scale, modelRotation, modelScale,
 * bodyType, mass, restitution, friction, linearDamping, angularDamping, primitive
 * shape dimensions, material; world.world gravity, skyColor, skybox, camera.
 * Scale is applied incrementally via SceneView.updateEntityPose → RenderItemRegistry.setScale.
 * modelRotation and modelScale are applied incrementally via updateEntityModelTransform.
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
    // modelRotation/modelScale are applied incrementally via updateEntityModelTransform.
    trimeshShape: entity.shape?.type === 'trimesh' ? entity.shape : undefined,
    model: entity.model,
    scripts: entity.scripts,
    transformers: transformersForSceneKey(entity.transformers),
  }
}

/** Strips `enabled` so toggling it does not force a full scene rebuild. */
function transformersForSceneKey(
  configs: Entity['transformers'],
): unknown {
  if (!configs?.length) return configs
  return configs.map(({ enabled: _omit, ...rest }) => rest)
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
