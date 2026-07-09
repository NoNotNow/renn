import type { RennWorld, Entity } from '@/types/world'

/**
 * Builds a stable string key from world-level parts that require a full scene rebuild.
 * Entity add/remove and most per-entity edits are handled incrementally; existing-entity
 * structural changes (scripts, trimesh, model) require an explicit scene version bump
 * via `worldChangesRequireSceneRebuild`.
 */
export function getEntityStructuralSceneKey(entity: Entity): string {
  return JSON.stringify(sceneRelevantEntity(entity))
}

/** True when `next` requires a full SceneView reload relative to `prev`. */
export function worldChangesRequireSceneRebuild(prev: RennWorld, next: RennWorld): boolean {
  if (getWorldLevelSceneKey(prev) !== getWorldLevelSceneKey(next)) return true

  const prevById = new Map(prev.entities.map((e) => [e.id, e]))
  const nextById = new Map(next.entities.map((e) => [e.id, e]))

  for (const [id, prevEntity] of prevById) {
    const nextEntity = nextById.get(id)
    if (!nextEntity) continue
    if (getEntityStructuralSceneKey(prevEntity) !== getEntityStructuralSceneKey(nextEntity)) {
      return true
    }
  }

  return false
}

export function getSceneDependencyKey(world: RennWorld): string {
  return getWorldLevelSceneKey(world)
}

function getWorldLevelSceneKey(world: RennWorld): string {
  const payload: Record<string, unknown> = {
    version: world.version,
    assets: sortKeys(world.assets ?? {}),
    scripts: sortKeys(world.scripts ?? {}),
    worldLights: {
      ambientLight: world.world.ambientLight,
      directionalLight: world.world.directionalLight,
    },
  }
  return JSON.stringify(payload)
}

function sceneRelevantEntity(entity: Entity): Record<string, unknown> {
  return {
    trimeshShape: entity.shape?.type === 'trimesh' ? entity.shape : undefined,
    model: entity.model,
    modelSimplification:
      entity.model && entity.shape?.type !== 'trimesh' ? entity.modelSimplification : undefined,
    scripts: entity.scripts,
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
